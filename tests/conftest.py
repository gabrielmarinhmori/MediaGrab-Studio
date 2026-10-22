import os
import tempfile

# Tests never touch personal history or the actual Downloads folder.
os.environ["MEDIAGRAB_DATA_DIR"] = tempfile.mkdtemp(prefix="mediagrab-tests-")
