function freezeColor(color) {
  return Object.freeze({
    ...color,
    roles: Object.freeze([...color.roles])
  });
}

const COLOR_PALETTE = Object.freeze([
  freezeColor({ id: 'black', name: '黑色', hex: '#111111', family: 'neutral', temperature: 'neutral', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'charcoal', name: '炭灰', hex: '#34363A', family: 'neutral', temperature: 'cool', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'mediumGray', name: '中灰', hex: '#808389', family: 'neutral', temperature: 'neutral', lightnessBand: 'medium', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'ivory', name: '米白', hex: '#F3EBDD', reportHex: '#F4EFE6', family: 'neutral', temperature: 'warm', lightnessBand: 'light', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'pureWhite', name: '纯白', hex: '#FFFFFF', family: 'neutral', temperature: 'cool', lightnessBand: 'light', chromaBand: 'clear', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'navy', name: '藏青', hex: '#1F2A44', family: 'blue', temperature: 'cool', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace', 'lowerBody'] }),
  freezeColor({ id: 'denimBlue', name: '牛仔蓝', hex: '#4E6E8E', family: 'blue', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'camel', name: '驼色', hex: '#B1845B', family: 'brown', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'muted', roles: ['main', 'secondary', 'outerLayer'] }),
  freezeColor({ id: 'khaki', name: '卡其', hex: '#B7A77A', family: 'brown', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'oatmeal', name: '燕麦', hex: '#D8CBB2', family: 'neutral', temperature: 'warm', lightnessBand: 'light', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'chocolate', name: '巧克力', hex: '#5C3828', family: 'brown', temperature: 'warm', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'caramel', name: '焦糖', hex: '#A86632', family: 'brown', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'moderate', roles: ['main', 'secondary', 'accent'] }),
  freezeColor({ id: 'butterYellow', name: '奶油黄', hex: '#F2D98B', family: 'yellow', temperature: 'warm', lightnessBand: 'light', chromaBand: 'muted', roles: ['secondary', 'nearFace', 'accent'] }),
  freezeColor({ id: 'gingerYellow', name: '姜黄', hex: '#C99318', family: 'yellow', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'moderate', roles: ['secondary', 'accent'] }),
  freezeColor({ id: 'apricot', name: '杏色', hex: '#E8B78F', family: 'orange', temperature: 'warm', lightnessBand: 'light', chromaBand: 'muted', roles: ['secondary', 'nearFace', 'accent'] }),
  freezeColor({ id: 'coral', name: '珊瑚', hex: '#E47766', family: 'red', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'moderate', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'tomatoRed', name: '番茄红', hex: '#D63C2F', family: 'red', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'clear', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'brickRed', name: '砖红', hex: '#9E4638', reportHex: '#A84A3A', family: 'red', temperature: 'warm', lightnessBand: 'deep', chromaBand: 'muted', roles: ['secondary', 'nearFace', 'accent'] }),
  freezeColor({ id: 'mistBlue', name: '雾蓝', hex: '#9FB3C8', family: 'blue', temperature: 'cool', lightnessBand: 'light', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'royalBlue', name: '宝蓝', hex: '#2456A6', family: 'blue', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'clear', roles: ['main', 'nearFace', 'accent'] }),
  freezeColor({ id: 'teal', name: '青绿', hex: '#287C78', family: 'green', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'moderate', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'lavender', name: '薰衣草', hex: '#A99BC7', family: 'purple', temperature: 'cool', lightnessBand: 'light', chromaBand: 'muted', roles: ['secondary', 'nearFace', 'accent'] }),
  freezeColor({ id: 'berry', name: '莓红', hex: '#9D315B', family: 'red', temperature: 'cool', lightnessBand: 'deep', chromaBand: 'moderate', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'burgundy', name: '酒红', hex: '#6D283A', family: 'red', temperature: 'cool', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'accent'] }),
  freezeColor({ id: 'sageGreen', name: '鼠尾草绿', hex: '#9BA889', family: 'green', temperature: 'neutral', lightnessBand: 'medium', chromaBand: 'muted', roles: ['main', 'secondary', 'nearFace'] }),
  freezeColor({ id: 'oliveGreen', name: '橄榄绿', hex: '#6D7044', family: 'green', temperature: 'warm', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'forestGreen', name: '森林绿', hex: '#214E3A', family: 'green', temperature: 'cool', lightnessBand: 'deep', chromaBand: 'muted', roles: ['main', 'secondary', 'lowerBody'] }),
  freezeColor({ id: 'dustyPink', name: '灰粉', hex: '#C3A0A6', family: 'red', temperature: 'neutral', lightnessBand: 'light', chromaBand: 'muted', roles: ['secondary', 'nearFace'] }),
  freezeColor({ id: 'cherryRed', name: '樱桃红', hex: '#B51E3E', family: 'red', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'clear', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'kumquat', name: '金橘', hex: '#EA8A25', family: 'orange', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'clear', roles: ['accent'] }),
  freezeColor({ id: 'limeGreen', name: '酸橙绿', hex: '#A8C93A', family: 'green', temperature: 'warm', lightnessBand: 'light', chromaBand: 'clear', roles: ['accent'] }),
  freezeColor({ id: 'emeraldGreen', name: '翠绿', hex: '#16845B', family: 'green', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'clear', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'magenta', name: '洋红', hex: '#C02B79', family: 'red', temperature: 'cool', lightnessBand: 'medium', chromaBand: 'clear', roles: ['nearFace', 'accent'] }),
  freezeColor({ id: 'gold', name: '金色', hex: '#C6A15B', family: 'metallic', temperature: 'warm', lightnessBand: 'medium', chromaBand: 'moderate', roles: ['accent', 'accessory'] }),
  freezeColor({ id: 'silver', name: '银色', hex: '#BFC3C7', family: 'metallic', temperature: 'cool', lightnessBand: 'light', chromaBand: 'muted', roles: ['accent', 'accessory'] }),
  freezeColor({ id: 'bronze', name: '青铜色', hex: '#8C6746', family: 'metallic', temperature: 'warm', lightnessBand: 'deep', chromaBand: 'muted', roles: ['accent', 'accessory'] })
]);

module.exports = { COLOR_PALETTE };
