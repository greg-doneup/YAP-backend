#!/usr/bin/env python3
"""
Train a prototype user-embedding autoencoder (128-d) on existing feedback history.
"""
import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from app.config import Config
from app.user_embedding_model import UserEmbeddingAutoencoder
from app.feature_store import get_feature_store


def gather_user_features():
    """Collect feedback features per user from Redis."""
    store = get_feature_store()
    r = store.client
    if not r:
        raise RuntimeError("Redis not available for feature store.")

    # Group scores by user
    user_scores = {}
    # feedback keys: feedback:{user_id}:{timestamp}
    for key in r.scan_iter(match='feedback:*'):
        try:
            payload = json.loads(r.get(key))
            uid = payload.get('user_id')
            score = float(payload.get('feedback_score', 0.0))
            user_scores.setdefault(uid, []).append(score)
        except Exception:
            continue

    # Build feature matrix: [avg_score, count]
    user_ids = []
    features = []
    for uid, scores in user_scores.items():
        avg = sum(scores) / len(scores)
        cnt = len(scores)
        user_ids.append(uid)
        features.append([avg, cnt])

    if not features:
        raise RuntimeError("No user feedback data found in Redis.")

    data_tensor = torch.tensor(features, dtype=torch.float32)
    return user_ids, data_tensor


def train_autoencoder(data_tensor):
    input_dim = data_tensor.size(1)
    model = UserEmbeddingAutoencoder(input_dim, Config.EMBEDDING_DIM)
    optimizer = optim.Adam(model.parameters(), lr=Config.LEARNING_RATE)
    criterion = nn.MSELoss()

    dataset = TensorDataset(data_tensor, data_tensor)
    loader = DataLoader(dataset, batch_size=Config.TRAIN_BATCH_SIZE, shuffle=True)

    model.train()
    for epoch in range(1, Config.TRAINING_EPOCHS + 1):
        epoch_loss = 0.0
        for batch_x, _ in loader:
            optimizer.zero_grad()
            recon, _ = model(batch_x)
            loss = criterion(recon, batch_x)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * batch_x.size(0)

        avg_loss = epoch_loss / len(dataset)
        print(f"Epoch {epoch}/{Config.TRAINING_EPOCHS}, Loss: {avg_loss:.6f}")

    # Save model state
    os.makedirs(os.path.dirname(Config.USER_EMBEDDING_PATH), exist_ok=True)
    torch.save(model.state_dict(), Config.USER_EMBEDDING_PATH)
    print(f"Saved user embedding model to {Config.USER_EMBEDDING_PATH}")
    return model


def main():
    user_ids, data_tensor = gather_user_features()
    print(f"Collected features for {len(user_ids)} users.")
    train_autoencoder(data_tensor)

if __name__ == '__main__':
    main()
