#!/usr/bin/env python3
"""
Fine-tune LoRA adapters per user based on recent feedback
"""
import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from app.config import Config
from app.feature_store import get_feature_store
from app.tts_provider import MozillaTTSProvider

class AdapterFineTuner:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.store = get_feature_store().client
        # Initialize provider to get model structure
        self.provider = MozillaTTSProvider()

    def gather_feedback(self):
        # Collect recent feedback scores for the user
        pattern = f"feedback:{self.user_id}:*"
        scores = []
        for key in self.store.scan_iter(match=pattern):
            try:
                data = json.loads(self.store.get(key))
                scores.append(float(data.get('feedback_score', 0.0)))
            except:
                continue
        return scores

    def fine_tune(self):
        scores = self.gather_feedback()
        if not scores:
            print(f"No feedback for user {self.user_id}, skipping.")
            return
        # Simple target: mean score
        target = torch.tensor([sum(scores) / len(scores)], dtype=torch.float32)

        # Load or init adapter state
        adapter_path = os.path.join(Config.LORA_ADAPTER_DIR, f"{self.user_id}.pt")
        if os.path.isfile(adapter_path):
            adapter = torch.load(adapter_path)
            # assume single weight param for simplicity
            delta = adapter.get('weight', torch.zeros(1,))
        else:
            delta = torch.zeros_like(target)
        delta = delta.clone().requires_grad_(True)

        optimizer = optim.Adam([delta], lr=Config.LEARNING_RATE)
        loss_fn = nn.MSELoss()

        # Finetune for a few steps
        for step in range(Config.FINETUNE_STEPS):
            optimizer.zero_grad()
            loss = loss_fn(delta, target)
            loss.backward()
            optimizer.step()
        # Save updated adapter
        os.makedirs(Config.LORA_ADAPTER_DIR, exist_ok=True)
        torch.save({'weight': delta.detach()}, adapter_path)
        print(f"Fine-tuned adapter for user {self.user_id}, saved to {adapter_path}")


def main():
    store = get_feature_store().client
    # Find all users with feedback
    users = set()
    for key in store.scan_iter(match='feedback:*'):
        parts = key.decode().split(':')
        if len(parts) > 1:
            users.add(parts[1])
    print(f"Found {len(users)} users to fine-tune adapters for.")
    for uid in users:
        tuner = AdapterFineTuner(uid)
        tuner.fine_tune()

if __name__ == '__main__':
    main()
