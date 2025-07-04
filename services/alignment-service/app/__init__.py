"""
The alignment service module initialization.

This module provides text-audio alignment services using WhisperX
to generate word and phoneme-level alignments.
"""

# Version information
__version__ = '1.0.0'

# Import primary modules for easier access
# Conditional imports based on whether this is a lightweight deployment
import os

if os.environ.get("GPU_ENABLED", "true").lower() == "false":
    # Lightweight mode - only import necessary modules
    from . import config
    from . import cache
else:
    # Full mode - import all modules
    from . import server
    from . import alignment
    from . import config
    from . import audio_utils
    from . import cache
    from . import storage

    # Make the main classes available at the package level
    from .alignment import AlignmentEngine
