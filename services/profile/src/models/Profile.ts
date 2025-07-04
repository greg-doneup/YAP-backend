import mongoose, { Schema, Document } from 'mongoose';

export interface IProfile extends Document {
  userId: string;
  email: string;
  name: string;
  initial_language_to_learn: string;
  native_language?: string; // User's spoken/native language for translations
  createdAt: Date;
  updatedAt: Date;
  
  // Waitlist fields
  isWaitlistUser?: boolean;
  waitlist_signup_at?: string;
  wlw?: boolean; // wallet_linked_to_wallet (has wallet)
  converted?: boolean; // waitlist user converted to full account
  
  // Encrypted wallet data (user-encrypted)
  passphrase_hash?: string;
  encrypted_mnemonic?: string;
  salt?: string;
  nonce?: string;
  
  // Wallet addresses and metadata
  seiWalletAddress?: string;
  evmWalletAddress?: string;
  wallet_created_at?: string;
  secured_at?: string;
  
  // Wallet objects
  sei_wallet?: {
    address: string;
    public_key: string;
  };
  eth_wallet?: {
    address: string;
    public_key: string;
  };
  
  // Enhanced encrypted wallet container
  encrypted_wallet_data?: {
    encrypted_mnemonic: string;
    salt: string;
    nonce: string;
    sei_address: string;
    eth_address: string;
  };
  
  // SECURE PASSPHRASE ARCHITECTURE FIELDS
  encryptedStretchedKey?: number[];
  encryptionSalt?: number[];
  stretchedKeyNonce?: number[];
  mnemonic_salt?: string;
  mnemonic_nonce?: string;
  
  // LEGACY FIELDS (for backwards compatibility, should not be used in new code)
  encryptedPrivateKey?: string;
  walletAddress?: string;
  keyCreatedAt?: Date;
  keyLastAccessed?: Date;
}

const ProfileSchema = new Schema<IProfile>({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  initial_language_to_learn: { type: String, required: true },
  native_language: { type: String }, // User's spoken/native language
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  
  // Waitlist fields
  isWaitlistUser: { type: Boolean, default: false },
  waitlist_signup_at: { type: String },
  wlw: { type: Boolean, default: false },
  converted: { type: Boolean, default: false },
  
  // Encrypted wallet data
  passphrase_hash: { type: String },
  encrypted_mnemonic: { type: String },
  salt: { type: String },
  nonce: { type: String },
  
  // Wallet addresses
  seiWalletAddress: { type: String },
  evmWalletAddress: { type: String },
  wallet_created_at: { type: String },
  secured_at: { type: String },
  
  // Wallet objects
  sei_wallet: {
    address: { type: String },
    public_key: { type: String }
  },
  eth_wallet: {
    address: { type: String },
    public_key: { type: String }
  },
  
  // Enhanced encrypted wallet container
  encrypted_wallet_data: {
    encrypted_mnemonic: { type: String },
    salt: { type: String },
    nonce: { type: String },
    sei_address: { type: String },
    eth_address: { type: String }
  },
  
  // SECURE PASSPHRASE ARCHITECTURE FIELDS
  encryptedStretchedKey: [{ type: Number }],
  encryptionSalt: [{ type: Number }],
  stretchedKeyNonce: [{ type: Number }],
  mnemonic_salt: { type: String },
  mnemonic_nonce: { type: String },
  
  // LEGACY FIELDS (for backwards compatibility)
  encryptedPrivateKey: { type: String },
  walletAddress: { type: String },
  keyCreatedAt: { type: Date },
  keyLastAccessed: { type: Date }
});

// Update the updatedAt field on save
ProfileSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema);
