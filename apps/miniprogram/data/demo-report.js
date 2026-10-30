const { generateReport } = require('../services/recommendation-engine');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../services/profile-contract');
const { buildVisualLayers } = require('../services/visual-layer-builder');

const DEMO_NOW = '2026-07-29T00:00:00.000Z';
const DEMO_PROFILE = Object.freeze(buildStyleProfile({
  analysisMode: 'manual',
  appearance: {
    lineQuality: 'balanced',
    faceOutline: 'oval',
    valueContrast: 'medium',
    visualScale: 'medium',
    hairLength: 'shoulder',
    hairTexture: 'straight',
    visibleHairVolume: 'medium',
    visibleHairColorFamily: 'black',
    glassesState: 'unknown',
    visibleGarmentSilhouette: 'straight',
    colorCalibration: {
      whiteChoice: 'equal',
      neutralChoice: 'equal',
      accentChoice: 'equal'
    }
  },
  preferences: {
    ...createDefaultPreferences(),
    presentationMode: 'neutral',
    scenes: ['commute'],
    desiredEffects: ['clean', 'vertical'],
    stylePreferences: ['minimal'],
    makeupPreference: 'light',
    trendEnabled: false
  }
}));

function getDemoReport() {
  const profile = JSON.parse(JSON.stringify(DEMO_PROFILE));
  const baseReport = generateReport(profile, { now: DEMO_NOW });
  return {
    ...baseReport,
    visualLayers: buildVisualLayers(baseReport, profile)
  };
}

module.exports = { getDemoReport, DEMO_NOW, DEMO_PROFILE };
