"""
models/lstm_model.py — Phase 3 LSTM for personal sequence prediction.

Architecture: 2-layer LSTM → dropout → fully connected output.
The LSTM learns temporal dependencies across up to 6 past cycles.

Training strategy
-----------------
1. Pre-train on public data (irregular-cycle subjects only).
2. Fine-tune on personal data with a lower learning rate.
3. On each new cycle: append to personal history, re-fine-tune for N epochs.

The model outputs a point estimate (next cycle length in days).
Uncertainty is estimated via Monte Carlo Dropout (keep dropout ON at inference,
run 100 forward passes, compute mean ± std of predictions).

Persistence: saved as .pt checkpoint + JSON metadata.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from config import (
    LSTM_HIDDEN_SIZE, LSTM_NUM_LAYERS, LSTM_DROPOUT,
    LSTM_LOOKBACK, LSTM_EPOCHS, LSTM_LR, LSTM_BATCH_SIZE,
    MODEL_DIR, RANDOM_SEED,
)

log = logging.getLogger(__name__)

LSTM_CHECKPOINT = MODEL_DIR / "lstm_pretrained.pt"
LSTM_PERSONAL   = MODEL_DIR / "lstm_personal.pt"
LSTM_META       = MODEL_DIR / "lstm_meta.json"

torch.manual_seed(RANDOM_SEED)


# ══════════════════════════════════════════════════════════════════════════════
# Network definition
# ══════════════════════════════════════════════════════════════════════════════

class CycleLSTM(nn.Module):
    """
    Stacked LSTM for menstrual cycle length prediction.
    Input:  (batch, lookback, n_features)
    Output: (batch,) — next cycle length (days)
    """

    def __init__(self, input_size: int, hidden_size: int = LSTM_HIDDEN_SIZE,
                 num_layers: int = LSTM_NUM_LAYERS, dropout: float = LSTM_DROPOUT):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            batch_first=True,
        )
        self.dropout = nn.Dropout(dropout)
        self.head    = nn.Linear(hidden_size, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq, features)
        out, _  = self.lstm(x)
        last    = out[:, -1, :]          # take last timestep
        dropped = self.dropout(last)
        pred    = self.head(dropped).squeeze(-1)
        return pred


# ══════════════════════════════════════════════════════════════════════════════
# Trainer
# ══════════════════════════════════════════════════════════════════════════════

class LSTMTrainer:

    def __init__(self, input_size: int, device: str = "cpu") -> None:
        self.device     = torch.device(device)
        self.input_size = input_size
        self.model      = CycleLSTM(input_size).to(self.device)
        self.history: list[float] = []

    # ── Pre-training on public data ───────────────────────────────────────────

    def pretrain(
        self,
        X: np.ndarray,
        y: np.ndarray,
        epochs: int = LSTM_EPOCHS,
        lr: float = LSTM_LR,
        val_split: float = 0.15,
    ) -> "LSTMTrainer":
        """Train on public dataset sequences. X: (N, lookback, features)."""
        log.info("Pre-training LSTM on %d sequences …", len(X))
        self._train_loop(X, y, epochs=epochs, lr=lr, val_split=val_split,
                         patience=20, save_path=LSTM_CHECKPOINT)
        return self

    # ── Fine-tuning on personal data ──────────────────────────────────────────

    def finetune(
        self,
        X: np.ndarray,
        y: np.ndarray,
        epochs: int = 60,
        lr: float = LSTM_LR * 0.2,
    ) -> "LSTMTrainer":
        """Fine-tune on personal sequences. Use a lower LR to avoid forgetting."""
        if len(X) < 2:
            log.warning("Not enough personal sequences to fine-tune (need ≥ 2).")
            return self
        log.info("Fine-tuning LSTM on %d personal sequences …", len(X))
        self._train_loop(X, y, epochs=epochs, lr=lr, val_split=0.0,
                         patience=15, save_path=LSTM_PERSONAL)
        return self

    def _train_loop(
        self,
        X: np.ndarray,
        y: np.ndarray,
        epochs: int,
        lr: float,
        val_split: float,
        patience: int,
        save_path: Path,
    ) -> None:
        # Train / val split (time-ordered — no shuffle across subjects)
        if val_split > 0 and len(X) > 10:
            cut  = int(len(X) * (1 - val_split))
            Xtr, Xval = X[:cut], X[cut:]
            ytr, yval = y[:cut], y[cut:]
        else:
            Xtr, Xval = X, None
            ytr, yval = y, None

        Xt = torch.tensor(Xtr, dtype=torch.float32).to(self.device)
        yt = torch.tensor(ytr, dtype=torch.float32).to(self.device)

        loader    = DataLoader(TensorDataset(Xt, yt), batch_size=LSTM_BATCH_SIZE, shuffle=True)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
        criterion = nn.HuberLoss(delta=2.0)   # robust to outlier cycle lengths

        best_val  = float("inf")
        no_improve = 0

        for epoch in range(1, epochs + 1):
            self.model.train()
            ep_loss = 0.0
            for xb, yb in loader:
                optimizer.zero_grad()
                pred = self.model(xb)
                loss = criterion(pred, yb)
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                optimizer.step()
                ep_loss += loss.item()

            ep_loss /= len(loader)
            self.history.append(ep_loss)

            # Validation
            if Xval is not None:
                self.model.eval()
                with torch.no_grad():
                    Xv = torch.tensor(Xval, dtype=torch.float32).to(self.device)
                    yv = torch.tensor(yval, dtype=torch.float32).to(self.device)
                    val_loss = criterion(self.model(Xv), yv).item()
                scheduler.step(val_loss)
                if val_loss < best_val:
                    best_val   = val_loss
                    no_improve = 0
                    torch.save(self.model.state_dict(), save_path)
                else:
                    no_improve += 1
                    if no_improve >= patience:
                        log.info("Early stopping at epoch %d (val_loss=%.3f).", epoch, val_loss)
                        break
                if epoch % 20 == 0:
                    log.info("Epoch %3d | train=%.3f | val=%.3f", epoch, ep_loss, val_loss)
            else:
                torch.save(self.model.state_dict(), save_path)
                if epoch % 20 == 0:
                    log.info("Epoch %3d | loss=%.3f", epoch, ep_loss)

        # Make sure we save even without validation
        if not save_path.exists():
            torch.save(self.model.state_dict(), save_path)

    # ── Inference with MC Dropout ─────────────────────────────────────────────

    def predict(self, x: np.ndarray, n_samples: int = 100) -> dict:
        """
        Monte Carlo Dropout inference.
        x: (lookback, n_features) — single sequence for ONE cycle ahead.
        Returns point estimate + 80% / 95% CIs.
        """
        xt = torch.tensor(x[np.newaxis, :, :], dtype=torch.float32).to(self.device)

        # Keep dropout ACTIVE during inference
        self.model.train()
        preds = []
        with torch.no_grad():
            for _ in range(n_samples):
                preds.append(float(self.model(xt).item()))

        preds_arr = np.array(preds)
        point = float(preds_arr.mean())
        std   = float(preds_arr.std())

        return {
            "point_estimate": round(point, 1),
            "std":            round(std, 2),
            "ci_lower_80":    round(float(np.percentile(preds_arr, 10)), 1),
            "ci_upper_80":    round(float(np.percentile(preds_arr, 90)), 1),
            "ci_lower_95":    round(float(np.percentile(preds_arr,  2.5)), 1),
            "ci_upper_95":    round(float(np.percentile(preds_arr, 97.5)), 1),
            "source":         "lstm_personal",
        }

    # ── Persistence ───────────────────────────────────────────────────────────

    def save_meta(self, feature_cols: list[str]) -> None:
        LSTM_META.write_text(json.dumps({
            "input_size": self.input_size,
            "feature_cols": feature_cols,
        }, indent=2))

    @classmethod
    def load(cls, personal: bool = True) -> "LSTMTrainer | None":
        if not LSTM_META.exists():
            return None
        meta = json.loads(LSTM_META.read_text())
        obj  = cls(input_size=meta["input_size"])
        ckpt = LSTM_PERSONAL if personal and LSTM_PERSONAL.exists() else LSTM_CHECKPOINT
        if not ckpt.exists():
            return None
        obj.model.load_state_dict(torch.load(ckpt, map_location=obj.device))
        log.info("Loaded LSTM from %s", ckpt)
        return obj, meta.get("feature_cols", [])
