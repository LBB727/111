function buildColorPlanRows(plan = {}) {
  const row = (key, roleLabel, locationLabel, placementKey) => ({
    key,
    roleLabel,
    name: plan[key]?.name || '',
    hex: plan[key]?.hex || '',
    percentage: plan[key]?.percentage ?? 0,
    locationLabel,
    placements: Array.isArray(plan[placementKey])
      ? [...plan[placementKey]]
      : []
  });

  return [
    row('main', '主色', '下装可用', 'lowerBody'),
    row('secondary', '辅助色', '近脸可用', 'nearFace'),
    row('accent', '点缀色', '配饰可用', 'accessories')
  ];
}

Component({
  properties: {
    plan: {
      type: Object,
      value: {},
      observer(plan) {
        this.setData({ rows: buildColorPlanRows(plan) });
      }
    }
  },

  data: {
    rows: []
  }
});

module.exports = { buildColorPlanRows };
