import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true, strict: 'throw' });

export const User = mongoose.models.QuantaraUser || mongoose.model('QuantaraUser', userSchema);
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const safeUser = (user) => ({ id: String(user._id || user.id), name: user.name, email: user.email });
