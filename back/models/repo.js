import mongoose from "mongoose";

const repoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  gitUrl: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  repoName: {
    type: String,
    default: null
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  defaultBranch: {
    type: String,
    default: null
  },
  Branch: {
    type: String,
    default: null
  },
  LastScanned: {
    type: String,
    default: null
  },
  Status: {
    type: String,
    default: "Not Scanned"
  },
  VerifiedRepositories: {
    type: Number,
    default: 0
  },
  UnverifiedRepositories: {
    type: Number,
    default: 0
  },
  TotalSecrets: {          // ✅ new field to track total secrets found
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Repository = mongoose.model("Repository", repoSchema);
export default Repository;
