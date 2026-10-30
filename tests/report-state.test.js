const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toggleFavorite,
  setFeedback,
  summarizeFeedback,
  normalizeFeedbackMap,
  isUsableReport
} = require('../apps/miniprogram/services/report-state');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  buildVisualLayers
} = require('../apps/miniprogram/services/visual-layer-builder');

const NOW = '2026-07-29T00:00:00.000Z';

function reportForPreferences(preferenceOverrides = {}) {
  const profile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['commute'],
      desiredEffects: ['clean', 'vertical'],
      ...preferenceOverrides
    }
  });
  const report = generateReport(profile, { now: NOW });
  report.visualLayers = buildVisualLayers(report, profile);
  return structuredClone(report);
}

function validReport() {
  return reportForPreferences();
}

test('toggleFavorite adds a missing id without mutating the input', () => {
  const before = ['rec-a'];
  const after = toggleFavorite(before, 'rec-b');

  assert.deepEqual(after, ['rec-a', 'rec-b']);
  assert.deepEqual(before, ['rec-a']);
});

test('toggleFavorite removes an existing id', () => {
  assert.deepEqual(toggleFavorite(['rec-a', 'rec-b'], 'rec-a'), ['rec-b']);
});

test('setFeedback selects, switches, and cancels each approved state', () => {
  const states = ['liked', 'not-for-me', 'owned', 'tried', 'suppress-similar'];
  let map = {};

  for (const state of states) {
    map = setFeedback(map, 'rec-a', state, 'clothing');
    assert.equal(map['rec-a'].state, state);
    assert.equal(map['rec-a'].recommendationId, 'rec-a');
    assert.equal(map['rec-a'].family, 'clothing');
    assert.match(map['rec-a'].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  }

  assert.deepEqual(setFeedback(map, 'rec-a', 'suppress-similar', 'clothing'), {});
});

test('setFeedback does not mutate the existing feedback map', () => {
  const before = { 'rec-a': 'tried' };

  setFeedback(before, 'rec-a', 'not-for-me', 'clothing');

  assert.deepEqual(before, { 'rec-a': 'tried' });
});

test('setFeedback rejects unknown states and unsafe suppression families', () => {
  const before = setFeedback({}, 'rec-a', 'liked', 'clothing');

  assert.deepEqual(
    setFeedback(before, 'rec-b', 'appearance-score', 'clothing'),
    before
  );
  assert.deepEqual(
    setFeedback(before, 'rec-b', 'suppress-similar', '来自照片的长相标签'),
    before
  );
  assert.deepEqual(setFeedback(before, 'rec-b', 'liked'), before);
  assert.deepEqual(setFeedback(before, 'rec-b', 'tried', 'unknown'), before);
});

test('legacy feedback migrates losslessly and idempotently to minimized records', () => {
  const legacy = {
    'rec-a': 'tried',
    'rec-b': 'not-for-me',
    unsafe: 'appearance-score'
  };
  const migrated = normalizeFeedbackMap(
    legacy,
    '2026-07-29T08:00:00.000Z'
  );

  assert.deepEqual(migrated, {
    'rec-a': {
      recommendationId: 'rec-a',
      family: 'unknown',
      state: 'tried',
      updatedAt: '2026-07-29T08:00:00.000Z'
    },
    'rec-b': {
      recommendationId: 'rec-b',
      family: 'unknown',
      state: 'not-for-me',
      updatedAt: '2026-07-29T08:00:00.000Z'
    }
  });
  assert.deepEqual(
    normalizeFeedbackMap(migrated, '2027-01-01T00:00:00.000Z'),
    migrated
  );
  assert.equal(JSON.stringify(migrated).includes('photo'), false);
  assert.equal(JSON.stringify(migrated).includes('appearance'), false);
});

test('legacy unknown family is retained only for tried and not-for-me records', () => {
  const migrated = normalizeFeedbackMap({
    liked: 'liked',
    owned: 'owned',
    tried: 'tried',
    rejected: 'not-for-me'
  }, NOW);

  assert.deepEqual(Object.keys(migrated), ['tried', 'rejected']);
  assert.equal(migrated.tried.family, 'unknown');
  assert.equal(migrated.rejected.family, 'unknown');
});

test('summarizeFeedback resolves current recommendation ids to applied rule ids', () => {
  const map = {
    'rec-liked': {
      recommendationId: 'rec-liked',
      family: 'clothing',
      state: 'liked',
      updatedAt: NOW
    },
    'rec-rejected': {
      recommendationId: 'rec-rejected',
      family: 'hairColor',
      state: 'not-for-me',
      updatedAt: NOW
    },
    'rec-owned': {
      recommendationId: 'rec-owned',
      family: 'accessories',
      state: 'owned',
      updatedAt: NOW
    },
    'rec-tried': {
      recommendationId: 'rec-tried',
      family: 'makeup',
      state: 'tried',
      updatedAt: NOW
    },
    'rec-suppressed': {
      recommendationId: 'rec-suppressed',
      family: 'clothing',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };
  const report = {
    sections: {
      clothing: [{
        id: 'rec-liked',
        family: 'clothing',
        appliedRuleIds: ['garment-vertical-open-line']
      }, {
        id: 'rec-suppressed',
        family: 'clothing',
        appliedRuleIds: ['garment-vertical-open-line']
      }],
      hairColor: [{
        id: 'rec-rejected',
        family: 'hairColor',
        appliedRuleIds: ['preference-hair-no-dye']
      }],
      accessories: [{
        id: 'rec-owned',
        family: 'accessories',
        appliedRuleIds: ['preference-lock-glasses']
      }],
      makeup: [{
        id: 'rec-tried',
        family: 'makeup',
        appliedRuleIds: ['preference-makeup-none']
      }]
    },
    topRecommendations: []
  };

  assert.deepEqual(summarizeFeedback(map, report), {
    likedRuleIds: ['garment-vertical-open-line'],
    rejectedRuleIds: ['preference-hair-no-dye'],
    ownedRuleIds: ['preference-lock-glasses'],
    triedRuleIds: ['preference-makeup-none'],
    suppressedFamilies: ['clothing']
  });
});

test('summarizeFeedback suppresses a family only when its current recommendation has an approved matching rule', () => {
  const report = validReport();
  const recommendation = report.sections.clothing[0];
  const feedback = {
    [recommendation.id]: {
      recommendationId: recommendation.id,
      family: recommendation.family,
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };

  assert.equal(isUsableReport(report), true);
  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    ['clothing']
  );
});

test('summarizeFeedback rejects suppression backed by a fabricated rule', () => {
  const feedback = {
    'rec-suppressed': {
      recommendationId: 'rec-suppressed',
      family: 'hairColor',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };
  const report = {
    sections: {
      hairColor: [{
        id: 'rec-suppressed',
        family: 'hairColor',
        appliedRuleIds: ['fabricated-rule']
      }]
    },
    topRecommendations: []
  };

  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    []
  );
});

test('summarizeFeedback rejects suppression backed by a real rule from another family', () => {
  const feedback = {
    'rec-suppressed': {
      recommendationId: 'rec-suppressed',
      family: 'hairColor',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };
  const report = {
    sections: {
      hairColor: [{
        id: 'rec-suppressed',
        family: 'hairColor',
        appliedRuleIds: ['garment-vertical-open-line']
      }]
    },
    topRecommendations: []
  };

  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    []
  );
});

test('summarizeFeedback ignores suppression when the current recommendation is missing', () => {
  const feedback = {
    'rec-missing': {
      recommendationId: 'rec-missing',
      family: 'clothing',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };

  assert.deepEqual(
    summarizeFeedback(feedback, { sections: {}, topRecommendations: [] })
      .suppressedFamilies,
    []
  );
});

test('cross-section duplicate ids invalidate the report instead of redirecting suppression', () => {
  const report = validReport();
  const clothing = report.sections.clothing[0];
  report.sections.hairColor[0].id = clothing.id;
  const feedback = {
    [clothing.id]: {
      recommendationId: clothing.id,
      family: 'clothing',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };

  assert.equal(isUsableReport(report), false);
  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    []
  );
});

test('report validation requires controlled nonempty garment ids in clothing and outfit plan', () => {
  for (const invalidIds of [[], ['fabricated-garment-template']]) {
    const clothingReport = validReport();
    clothingReport.sections.clothing[0].garmentTemplateIds = invalidIds;
    assert.equal(isUsableReport(clothingReport), false);

    const outfitReport = validReport();
    outfitReport.outfitPlan.itemIds = invalidIds;
    assert.equal(isUsableReport(outfitReport), false);
  }
});

test('a recommendation placed under another family section cannot enter feedback summary', () => {
  const report = validReport();
  const recommendation = report.sections.clothing[0];
  recommendation.family = 'hairColor';
  recommendation.appliedRuleIds = ['preference-hair-no-dye'];
  const feedback = {
    [recommendation.id]: {
      recommendationId: recommendation.id,
      family: 'hairColor',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };

  assert.equal(isUsableReport(report), false);
  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    []
  );
});

test('injected Top rules are excluded from stored feedback resolution', () => {
  const report = validReport();
  const injected = report.topRecommendations[0];
  injected.id = 'top-injected-rule';
  injected.family = 'clothing';
  injected.appliedRuleIds = ['garment-vertical-open-line'];
  const feedback = {
    [injected.id]: {
      recommendationId: injected.id,
      family: 'clothing',
      state: 'suppress-similar',
      updatedAt: NOW
    }
  };

  assert.equal(isUsableReport(report), false);
  assert.deepEqual(
    summarizeFeedback(feedback, report).suppressedFamilies,
    []
  );
});

test('persisted feedback changes the generated priority of its real applied rule', () => {
  const baseProfile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['commute'],
      desiredEffects: ['clean', 'vertical']
    }
  });
  const currentReport = generateReport(baseProfile, { now: NOW });
  const recommendation = currentReport.sections.clothing[0];
  const expectedAdjustments = {
    liked: 30,
    'not-for-me': -80,
    owned: 20,
    tried: 10
  };

  for (const [state, adjustment] of Object.entries(expectedAdjustments)) {
    const feedbackMap = {
      [recommendation.id]: {
        recommendationId: recommendation.id,
        family: recommendation.family,
        state,
        updatedAt: NOW
      }
    };
    const regeneratedProfile = buildStyleProfile({
      analysisMode: baseProfile.analysisMode,
      appearance: baseProfile.confirmedAppearance,
      preferences: baseProfile,
      feedbackSummary: summarizeFeedback(feedbackMap, currentReport)
    });
    const regenerated = generateReport(regeneratedProfile, { now: NOW });

    assert.deepEqual(
      regeneratedProfile.feedbackSummary[
        state === 'liked'
          ? 'likedRuleIds'
          : state === 'not-for-me'
            ? 'rejectedRuleIds'
            : state === 'owned'
              ? 'ownedRuleIds'
              : 'triedRuleIds'
      ],
      recommendation.appliedRuleIds,
      state
    );
    assert.equal(
      regenerated.sections.clothing[0].priority,
      recommendation.priority + adjustment,
      state
    );
  }
});

test('isUsableReport accepts a complete generated RecommendationReportV2', () => {
  assert.equal(isUsableReport(validReport()), true);
});

test('isUsableReport requires all three visual layers and controlled styling asset paths', () => {
  for (const layerName of ['overall', 'collage', 'technical']) {
    const report = validReport();
    delete report.visualLayers[layerName];
    assert.equal(isUsableReport(report), false, layerName);
  }

  const hostileOverall = validReport();
  hostileOverall.visualLayers.overall.assetPath = '/tmp/portrait.png';
  assert.equal(isUsableReport(hostileOverall), false);

  const hostileItem = validReport();
  hostileItem.visualLayers.collage.items[0].assetPath = '/assets/branding/brand-mark.svg';
  assert.equal(isUsableReport(hostileItem), false);
});

test('isUsableReport accepts all overall presentation assets and preserve-current output', () => {
  const expectedAssets = {
    womenswear: '/assets/styling/overall-womenswear.svg',
    menswear: '/assets/styling/overall-menswear.svg',
    neutral: '/assets/styling/overall-neutral.svg',
    mixed: '/assets/styling/overall-mixed.svg'
  };
  for (const [presentationMode, assetPath] of Object.entries(expectedAssets)) {
    const report = reportForPreferences({ presentationMode });

    assert.equal(report.visualLayers.overall.assetPath, assetPath);
    assert.equal(isUsableReport(report), true, presentationMode);
  }

  const preserved = reportForPreferences({ lockedAreas: ['fit'] });
  assert.deepEqual(
    preserved.visualLayers.overall.garmentTemplateIds,
    ['preserveCurrentGarments']
  );
  assert.deepEqual(preserved.visualLayers.overall.pieces, []);
  assert.equal(preserved.visualLayers.overall.preserveCurrent, true);
  assert.equal(preserved.visualLayers.overall.fitLocked, true);
  assert.equal(isUsableReport(preserved), true);
});

test('isUsableReport rejects an old overall layer missing native composition bindings', () => {
  for (const field of [
    'garmentTemplateIds', 'pieces', 'accent', 'preserveCurrent',
    'fitLocked', 'statusLabel'
  ]) {
    const report = validReport();
    delete report.visualLayers.overall[field];

    assert.equal(isUsableReport(report), false, field);
  }
});

test('isUsableReport requires the exact overall shape and an approved overall asset', () => {
  const unapprovedAsset = validReport();
  unapprovedAsset.visualLayers.overall.assetPath =
    '/assets/styling/not-a-real-approved-overall.svg';

  const extraRemoteField = validReport();
  extraRemoteField.visualLayers.overall.remoteImageUrl =
    'https://example.com/overall.png';

  assert.equal(isUsableReport(unapprovedAsset), false);
  assert.equal(isUsableReport(extraRemoteField), false);
});

test('isUsableReport rejects uncontrolled or malformed overall hair swatches', () => {
  const mutations = {
    arbitraryColor: (swatch) => {
      swatch.name = '任意色';
      swatch.hex = '#ABCDEF';
    },
    wrongControlledHex: (swatch) => {
      swatch.name = '自然黑';
      swatch.hex = '#FFFFFF';
    },
    nonApproximate: (swatch) => {
      swatch.approximate = false;
    },
    extraRemoteField: (swatch) => {
      swatch.remoteImageUrl = 'https://example.com/hair.png';
    }
  };

  for (const [name, mutate] of Object.entries(mutations)) {
    const report = validReport();
    mutate(report.visualLayers.overall.hairColorSwatch);

    assert.equal(isUsableReport(report), false, name);
  }
});

test('isUsableReport rejects duplicate or mismatched overall garments and pieces', () => {
  const mutations = {
    duplicateGarmentTemplate: (overall) => {
      overall.garmentTemplateIds[1] = overall.garmentTemplateIds[0];
    },
    duplicatePiece: (overall) => {
      overall.pieces[1] = structuredClone(overall.pieces[0]);
    },
    missingPiece: (overall) => {
      overall.pieces.pop();
    },
    wrongPieceId: (overall) => {
      overall.pieces[0].id = 'overall-piece-fabricated';
    },
    wrongTemplate: (overall) => {
      overall.pieces[0].templateId = 'straightTrousers';
    },
    wrongName: (overall) => {
      overall.pieces[0].name = '任意服装';
    },
    wrongSilhouette: (overall) => {
      overall.pieces[0].silhouette = 'dress-a-line';
    },
    wrongColorRole: (overall) => {
      overall.pieces[0].colorRole = 'accent';
    },
    wrongColor: (overall) => {
      overall.pieces[0].hex = '#A84A3A';
    },
    extraRemoteField: (overall) => {
      overall.pieces[0].assetPath = 'https://example.com/piece.png';
    }
  };

  for (const [name, mutate] of Object.entries(mutations)) {
    const report = validReport();
    mutate(report.visualLayers.overall);

    assert.equal(isUsableReport(report), false, name);
  }
});

test('isUsableReport requires controlled overall accent, flags, and status semantics', () => {
  const mutations = {
    wrongAccentRole: (overall) => {
      overall.accent.colorRole = 'main';
    },
    wrongAccentColor: (overall) => {
      overall.accent.hex = '#1F2A44';
    },
    wrongAccentLabel: (overall) => {
      overall.accent.label = '远程标签';
    },
    nonBooleanPreserveFlag: (overall) => {
      overall.preserveCurrent = 'false';
    },
    nonBooleanFitFlag: (overall) => {
      overall.fitLocked = 'false';
    },
    mismatchedStatus: (overall) => {
      overall.statusLabel = '版型已锁定 · 保留当前轮廓';
    }
  };

  for (const [name, mutate] of Object.entries(mutations)) {
    const report = validReport();
    mutate(report.visualLayers.overall);

    assert.equal(isUsableReport(report), false, name);
  }
});

test('isUsableReport rejects persisted collage items missing native render bindings', () => {
  for (const field of ['hex', 'visualType']) {
    const report = validReport();
    delete report.visualLayers.collage.items[0][field];

    assert.equal(isUsableReport(report), false, field);
  }
});

test('isUsableReport rejects duplicate collage item ids', () => {
  const report = validReport();
  report.visualLayers.collage.items[1].id =
    report.visualLayers.collage.items[0].id;

  assert.equal(isUsableReport(report), false);
});

test('isUsableReport rejects unapproved collage assets, type mismatches, and plan color mismatches', () => {
  const mutations = {
    unapprovedAsset: (item) => {
      item.assetPath = '/assets/styling/item-cape.svg';
    },
    mismatchedVisualType: (item) => {
      item.visualType = 'shoes';
    },
    mismatchedControlledHex: (item) => {
      item.hex = '#A84A3A';
    },
    unapprovedColorName: (item) => {
      item.colorName = '网络推荐色';
    },
    arbitraryRemoteField: (item) => {
      item.remoteImageUrl = 'https://example.com/look.png';
    }
  };

  for (const [name, mutate] of Object.entries(mutations)) {
    const report = validReport();
    mutate(report.visualLayers.collage.items[0]);

    assert.equal(isUsableReport(report), false, name);
  }
});

test('isUsableReport matches a collage color against any repeated plan color name', () => {
  const report = validReport();
  report.colorPlan.main = {
    name: '米白',
    hex: '#F3EBDD',
    percentage: 60
  };
  report.visualLayers.overall.colorBlocks[0] = {
    ...report.colorPlan.main
  };
  for (const piece of report.visualLayers.overall.pieces) {
    if (piece.colorRole !== 'main') continue;
    piece.colorName = '米白';
    piece.hex = '#F3EBDD';
  }
  for (const item of report.visualLayers.collage.items) {
    if (item.colorName !== '藏青') continue;
    item.colorName = '米白';
    item.hex = '#F3EBDD';
  }

  assert.equal(isUsableReport(report), true);
});

test('isUsableReport requires one or two complete controlled technical items', () => {
  const mutations = {
    missingItems: (technical) => {
      delete technical.technicalItems;
    },
    emptyItems: (technical) => {
      technical.technicalItems = [];
    },
    malformedItem: (technical) => {
      technical.technicalItems = [null];
    },
    tooManyItems: (technical) => {
      technical.technicalItems.push(
        structuredClone(technical.technicalItems[0])
      );
    },
    unsafeId: (technical) => {
      technical.technicalItems[0].id = 'technical item';
    },
    missingTitle: (technical) => {
      technical.technicalItems[0].title = '';
    },
    unapprovedAsset: (technical) => {
      technical.technicalItems[0].assetPath =
        '/assets/styling/technical-custom.svg';
    },
    emptyLabels: (technical) => {
      technical.technicalItems[0].labels = [];
    },
    duplicateLabelKey: (technical) => {
      technical.technicalItems[0].labels[1] = structuredClone(
        technical.technicalItems[0].labels[0]
      );
    },
    unapprovedLabelKey: (technical) => {
      technical.technicalItems[0].labels[0].key = 'remoteDimension';
    },
    nonChineseLabelValue: (technical) => {
      technical.technicalItems[0].labels[0].value = 'regular';
    }
  };

  for (const [name, mutate] of Object.entries(mutations)) {
    const report = validReport();
    mutate(report.visualLayers.technical);

    assert.equal(isUsableReport(report), false, name);
  }
});

test('isUsableReport rejects visual colors that diverge from the controlled report plan', () => {
  const report = validReport();
  report.visualLayers.overall.colorBlocks[0] = {
    name: '自定义颜色',
    hex: '#ABCDEF',
    percentage: 60
  };

  assert.equal(isUsableReport(report), false);
});

test('isUsableReport rejects the wrong schema, mode, or rule version', () => {
  for (const [field, value] of [
    ['schemaVersion', 1],
    ['mode', 'local'],
    ['ruleSetVersion', 'cn-style-2026.06']
  ]) {
    const report = validReport();
    report[field] = value;
    assert.equal(isUsableReport(report), false, field);
  }
});

test('isUsableReport requires exactly three unique top recommendation ids', () => {
  const missing = validReport();
  missing.topRecommendations.pop();
  const duplicate = validReport();
  duplicate.topRecommendations[1].id = duplicate.topRecommendations[0].id;

  assert.equal(isUsableReport(missing), false);
  assert.equal(isUsableReport(duplicate), false);
});

test('isUsableReport requires a complete 100-percent color triangle', () => {
  const missingRole = validReport();
  delete missingRole.colorPlan.accent;
  const badTotal = validReport();
  badTotal.colorPlan.secondary.percentage = 20;

  assert.equal(isUsableReport(missingRole), false);
  assert.equal(isUsableReport(badTotal), false);
});

test('isUsableReport requires the six nonempty V2 result sections', () => {
  const missing = validReport();
  delete missing.sections.sceneTransition;
  const empty = validReport();
  empty.sections.hairColor = [];
  const extra = validReport();
  extra.sections.other = [extra.sections.hair[0]];

  assert.equal(isUsableReport(missing), false);
  assert.equal(isUsableReport(empty), false);
  assert.equal(isUsableReport(extra), false);
});

test('isUsableReport requires every section rule id to use the controlled id format', () => {
  const report = validReport();
  report.sections.hairColor[0].appliedRuleIds = ['not a controlled id'];

  assert.equal(isUsableReport(report), false);
});

test('a well-formed nonexistent rule is unusable and never enters feedback summary', () => {
  const report = validReport();
  const recommendation = report.sections.hairColor[0];
  recommendation.appliedRuleIds = ['fabricated-rule'];

  assert.equal(isUsableReport(report), false);
  assert.deepEqual(summarizeFeedback({
    [recommendation.id]: {
      recommendationId: recommendation.id,
      family: recommendation.family,
      state: 'liked',
      updatedAt: NOW
    }
  }, report).likedRuleIds, []);
});

test('a real rule from the wrong family is unusable and never enters feedback summary', () => {
  const report = validReport();
  const recommendation = report.sections.hairColor[0];
  recommendation.appliedRuleIds = [
    report.sections.clothing[0].appliedRuleIds[0]
  ];

  assert.equal(isUsableReport(report), false);
  assert.deepEqual(summarizeFeedback({
    [recommendation.id]: {
      recommendationId: recommendation.id,
      family: recommendation.family,
      state: 'tried',
      updatedAt: NOW
    }
  }, report).triedRuleIds, []);
});

test('isUsableReport rejects incomplete visible, garment, and hair-color structures', () => {
  const visible = validReport();
  visible.sections.makeup[0].reason = '';
  const garment = validReport();
  delete garment.sections.clothing[0].shoulderConstruction;
  const hairColor = validReport();
  delete hairColor.sections.hairColor[0].noDyeAlternative;

  assert.equal(isUsableReport(visible), false);
  assert.equal(isUsableReport(garment), false);
  assert.equal(isUsableReport(hairColor), false);
});

test('isUsableReport rejects photo paths, fabricated model fields, and banned wording', () => {
  const photoPath = validReport();
  photoPath.photoPath = 'wxfile://portrait.jpg';
  const modelField = validReport();
  modelField.sections.hair[0].modelObservation = '自动观察';
  const bannedWording = validReport();
  bannedWording.sections.clothing[0].action = '显瘦搭配';

  assert.equal(isUsableReport(photoPath), false);
  assert.equal(isUsableReport(modelField), false);
  assert.equal(isUsableReport(bannedWording), false);
});

test('isUsableReport rejects Windows, POSIX, temporary, relative-image, and file-scheme paths', () => {
  const pathCases = [
    'C:\\Users\\person\\Pictures\\portrait.jpg',
    '/home/person/photos/portrait.png',
    '%TEMP%\\style-preview.webp',
    'images/style-preview.jpg',
    'assets/portrait.jpg',
    'lookbook/saved/previews/portrait.jpeg',
    'wxfile://tmp_123/portrait.jpg',
    'file:///Users/person/portrait.jpg'
  ];

  for (const pathValue of pathCases) {
    const report = validReport();
    report.sections.hair[0].alternative = pathValue;
    assert.equal(isUsableReport(report), false, pathValue);
  }
});

test('isUsableReport rejects hidden path data under an alternate key', () => {
  const report = validReport();
  report.sections.hair[0].sourceReference = '/tmp/style-preview.png';

  assert.equal(isUsableReport(report), false);
});

test('isUsableReport permits benign slash text that is not a filesystem path', () => {
  const report = validReport();
  report.sections.hair[0].alternative = '可以在藏青/米白之间选择，保留A/B两种方案，也可以完全跳过。';

  assert.equal(isUsableReport(report), true);
});
