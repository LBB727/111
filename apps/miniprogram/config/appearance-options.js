function values(items) {
  return Object.freeze([...items]);
}

const APPEARANCE_VALUES = Object.freeze({
  lineQuality: values(['soft', 'balanced', 'sharp', 'unknown']),
  faceOutline: values(['oval', 'round', 'angular', 'long', 'upperWideLowerNarrow', 'unknown']),
  valueContrast: values(['low', 'medium', 'high', 'unknown']),
  visualScale: values(['light', 'medium', 'strong', 'unknown']),
  hairLength: values(['short', 'jaw', 'shoulder', 'chest', 'long', 'unknown']),
  hairTexture: values(['straight', 'wavy', 'curly', 'coily', 'unknown']),
  visibleHairVolume: values(['low', 'medium', 'high', 'unknown']),
  visibleHairColorFamily: values([
    'black', 'deepBrown', 'mediumBrown', 'lightBrown', 'redBrown', 'copper',
    'coolBrown', 'blueBlack', 'other', 'unknown'
  ]),
  glassesState: values(['none', 'visible', 'unknown']),
  visibleGarmentSilhouette: values([
    'straight', 'fittedCut', 'relaxed', 'aLine', 'tapered', 'flared', 'cropped',
    'longline', 'oversizedCut', 'unknown'
  ])
});

const COLOR_CALIBRATION_VALUES = Object.freeze({
  whiteChoice: values(['ivory', 'pureWhite', 'equal', 'unknown']),
  neutralChoice: values(['warmBrown', 'coolGray', 'equal', 'unknown']),
  accentChoice: values(['brickRed', 'berry', 'equal', 'unknown'])
});

module.exports = { APPEARANCE_VALUES, COLOR_CALIBRATION_VALUES };
