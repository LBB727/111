Component({
  properties: {
    label: {
      type: String,
      value: ''
    },
    options: {
      type: Array,
      value: []
    },
    value: {
      type: null,
      value: ''
    },
    multiple: {
      type: Boolean,
      value: false
    },
    required: {
      type: Boolean,
      value: false
    },
    appearance: {
      type: String,
      value: 'solid'
    }
  },

  data: {
    displayOptions: []
  },

  observers: {
    'options, value, multiple': function updateDisplayOptions(options, value, multiple) {
      const selectedValues = multiple
        ? (Array.isArray(value) ? value : [])
        : [value];

      this.setData({
        displayOptions: options.map((option) => ({
          ...option,
          selected: selectedValues.includes(option.value)
        }))
      });
    }
  },

  methods: {
    onSelect(event) {
      const option = this.data.options[Number(event.currentTarget.dataset.index)];
      if (!option || option.disabled) return;

      let nextValue = option.value;
      if (this.data.multiple) {
        const current = Array.isArray(this.data.value) ? this.data.value : [];
        nextValue = current.includes(option.value)
          ? current.filter((value) => value !== option.value)
          : [...current, option.value];
      }

      this.setData({ value: nextValue });
      this.triggerEvent('change', { value: nextValue });
    }
  }
});
