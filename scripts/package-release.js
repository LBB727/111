// Dependency-free, deterministic ZIP writer for this small source distribution.
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { verifyProject } = require('./verify-project');

const ROOT_ENTRIES = [
  'apps', 'tests', 'scripts', 'docs', 'output', '.github', '.gitignore',
  '.gitattributes', 'package.json', 'project.config.json', 'README.md',
  'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md'
];
const EXCLUDED = /^(?:\.env(?:\..*)?|project\.private\.config\.json|node_modules|\.git|dist|work)$|\.(?:pem|key|log)$/i;

function collectFiles(root) {
  const files = [];
  function visit(relative) {
    if (EXCLUDED.test(path.basename(relative))) return;
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      files.push({ name: relative.split(path.sep).join('/'), data: fs.readFileSync(absolute) });
    }
  }
  ROOT_ENTRIES.forEach(visit);
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const chunks = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(`bense-wardrobe/${file.name}`, 'utf8');
    const packed = deflateRawSync(file.data, { level: 9 });
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // DEFLATE
    header.writeUInt16LE(33, 12); // 1980-01-01, fixed for reproducibility
    header.writeUInt32LE(crc32(file.data), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    chunks.push(header, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += header.length + name.length + packed.length;
  }
  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralDirectory, end]);
}

function packageRelease(root = path.resolve(__dirname, '..')) {
  const validation = verifyProject(root);
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const files = collectFiles(root);
  const manifest = files.map(({ name, data }) => ({
    path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')
  }));
  files.push({ name: 'MANIFEST.json', data: Buffer.from(JSON.stringify({ version, files: manifest }, null, 2) + '\n') });
  const archive = makeZip(files);
  const output = path.join(root, 'dist');
  fs.mkdirSync(output, { recursive: true });
  const filename = `bense-wardrobe-v${version}.zip`;
  fs.writeFileSync(path.join(output, filename), archive);
  fs.writeFileSync(path.join(output, `${filename}.sha256`), `${createHash('sha256').update(archive).digest('hex')}  ${filename}\n`);
  console.log(`Packaged ${files.length} files: ${filename} (${archive.length} bytes)`);
  return archive;
}

if (require.main === module) packageRelease();
module.exports = { collectFiles, crc32, makeZip, packageRelease };
