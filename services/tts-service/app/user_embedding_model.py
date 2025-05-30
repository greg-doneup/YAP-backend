"""
Defines a simple autoencoder for user embedding.
"""
import torch
import torch.nn as nn

class UserEmbeddingAutoencoder(nn.Module):
    def __init__(self, input_dim: int, embedding_dim: int):
        super(UserEmbeddingAutoencoder, self).__init__()
        # Encoder: input_dim -> 64 -> embedding_dim
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, embedding_dim)
        )
        # Decoder: embedding_dim -> 64 -> input_dim
        self.decoder = nn.Sequential(
            nn.Linear(embedding_dim, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim)
        )

    def forward(self, x: torch.Tensor):
        z = self.encoder(x)
        out = self.decoder(z)
        return out, z
