Component({
  properties: {
    item: {
      type: Object,
      value: {}
    },
    favorite: {
      type: Boolean,
      value: false
    },
    feedback: {
      type: String,
      value: ''
    }
  },

  data: {
    expanded: false
  },

  methods: {
    onToggleExpanded() {
      this.setData({ expanded: !this.data.expanded });
    },

    onFavoriteChange() {
      const id = this.properties.item && this.properties.item.id;
      if (id) this.triggerEvent('favoritechange', { id });
    },

    onFeedbackChange(event) {
      const id = this.properties.item && this.properties.item.id;
      const state = event.currentTarget.dataset.state;
      if (id && state) this.triggerEvent('feedbackchange', { id, state });
    }
  }
});
