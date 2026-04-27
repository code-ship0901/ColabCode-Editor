const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  roomId: { type: String, required: true },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
  },
  content: { type: String, default: '' },
  whiteboardData: { type: String, default: '[]' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

fileSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('File', fileSchema);
