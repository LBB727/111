const { safeNavigate } = require('../../utils/navigation');
const { createOperationGuard } = require('../../utils/operation-guard');
const { nextRequiredRoute } = require('../../utils/flow-state');

const READ_ERROR_COPY = '无法读取这张照片，请重新选择';

function isCancellation(error = {}) {
  return String(error.errMsg || '').toLowerCase().includes('cancel');
}

Page({
  data: {
    previewPath: '',
    selecting: false,
    photoKind: ''
  },

  onLoad() {
    this.operationGuard = createOperationGuard();
    this._validateConsent();
    this.setData({ photoKind: getApp().globalData.session.photoKind || '' });
  },

  onShow() {
    this._validateConsent();
  },

  onUnload() {
    this.operationGuard.invalidate();
  },

  onPhotoKindChange(event) {
    const photoKind = event.detail.value;
    if (!['portrait', 'fullBody'].includes(photoKind)) return;
    getApp().globalData.session.photoKind = photoKind;
    this.setData({ photoKind });
  },

  onChoosePhoto(event) {
    if (!this._validateConsent()) return;
    if (this.data.selecting) return;

    if (!['portrait', 'fullBody'].includes(this.data.photoKind)) {
      wx.showToast({ title: '请先选择头像或全身照', icon: 'none' });
      return;
    }

    const source = event.currentTarget.dataset.source;
    const operationToken = this.operationGuard.begin();
    this.setData({ selecting: true });

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source],
      success: ({ tempFiles = [] }) => {
        if (!this.operationGuard.isCurrent(operationToken)) return;

        const selected = tempFiles[0];
        const photoPath = selected && selected.tempFilePath;
        if (!photoPath) {
          this.showReadError(operationToken);
          return;
        }

        this.setData({ previewPath: photoPath });
        this.readPhotoMetadata(photoPath, operationToken);
      },
      fail: (error) => {
        if (!this.operationGuard.isCurrent(operationToken)) return;

        this.setData({ selecting: false });
        if (!isCancellation(error)) {
          wx.showToast({ title: '暂时无法选择照片，请重试', icon: 'none' });
        }
      }
    });
  },

  readPhotoMetadata(photoPath, operationToken) {
    wx.getImageInfo({
      src: photoPath,
      success: (imageInfo) => {
        if (!this.operationGuard.isCurrent(operationToken)) return;

        wx.getFileSystemManager().getFileInfo({
          filePath: photoPath,
          success: (fileInfo) => {
            if (!this.operationGuard.isCurrent(operationToken)) return;

            const session = getApp().globalData.session;
            Object.assign(session, {
              photoKind: this.data.photoKind,
              photoPath,
              photoMeta: {
                path: photoPath,
                width: imageInfo.width,
                height: imageInfo.height,
                size: fileInfo.size,
                decoded: true,
                ...(imageInfo.type ? { type: imageInfo.type } : {})
              },
              qualityResult: null,
              appearanceCandidates: null,
              features: null,
              preferences: null,
              report: null
            });
            this.setData({ selecting: false });
            safeNavigate(
              wx,
              '/pages/quality-check/index',
              '/pages/quality-check/index',
              () => this.operationGuard.isCurrent(operationToken)
            );
          },
          fail: () => this.showReadError(operationToken)
        });
      },
      fail: () => this.showReadError(operationToken)
    });
  },

  showReadError(operationToken) {
    if (!this.operationGuard.isCurrent(operationToken)) return;

    this.setData({ selecting: false });
    wx.showToast({ title: READ_ERROR_COPY, icon: 'none' });
  },

  _validateConsent() {
    const session = getApp().globalData.session;
    const required = nextRequiredRoute({
      ...session,
      photoKind: '',
      photoPath: '',
      photoMeta: null,
      qualityResult: null,
      features: null,
      preferences: null,
      report: null
    });
    if (required === '/pages/capture/index') return true;
    wx.redirectTo({ url: required });
    return false;
  }
});
