import sys
from pathlib import Path


DIRECTORIO_PYTHON = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DIRECTORIO_PYTHON))
