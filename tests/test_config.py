"""Startup configuration tests (config.json + GRS_* overrides)."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from backend.config import ConfigError, load_config


class ConfigTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-config-test-"))
        self.config_path = self.temp_dir / "config.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def write_config(self, data) -> None:
        self.config_path.write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )

    def test_reads_config_and_resolves_relative_paths(self):
        self.write_config(
            {
                "host": "0.0.0.0",
                "port": 9100,
                "records_db": "db/records.db",
                "plans_db": "db/plans.db",
                "open_browser": False,
                "debug": True,
            }
        )
        cfg = load_config(self.config_path, env={})
        self.assertEqual(cfg.host, "0.0.0.0")
        self.assertEqual(cfg.port, 9100)
        self.assertEqual(cfg.records_db, (self.temp_dir / "db/records.db").resolve())
        self.assertEqual(cfg.plans_db, (self.temp_dir / "db/plans.db").resolve())
        self.assertFalse(cfg.open_browser)
        self.assertTrue(cfg.debug)
        self.assertEqual(cfg.source, self.config_path.resolve())

    def test_partial_config_uses_defaults_relative_to_config_dir(self):
        self.write_config({"port": 9200})
        cfg = load_config(self.config_path, env={})
        self.assertEqual(cfg.port, 9200)
        self.assertEqual(cfg.records_db, (self.temp_dir / "data/records.db").resolve())
        self.assertEqual(cfg.plans_db, (self.temp_dir / "data/plans.db").resolve())
        self.assertTrue(cfg.open_browser)

    def test_environment_overrides_file(self):
        self.write_config(
            {
                "host": "127.0.0.1",
                "port": 9100,
                "records_db": "data/records.db",
                "plans_db": "data/plans.db",
                "open_browser": True,
                "debug": False,
            }
        )
        records = (self.temp_dir / "env-records.db").resolve()
        plans = (self.temp_dir / "env-plans.db").resolve()
        cfg = load_config(
            self.config_path,
            env={
                "GRS_HOST": "127.0.0.2",
                "GRS_PORT": "9101",
                "GRS_DB": f'"{records}"',
                "GRS_PLAN_DB": str(plans),
                "GRS_OPEN_BROWSER": "0",
                "GRS_DEBUG": "yes",
            },
        )
        self.assertEqual(cfg.host, "127.0.0.2")
        self.assertEqual(cfg.port, 9101)
        self.assertEqual(cfg.records_db, records)
        self.assertEqual(cfg.plans_db, plans)
        self.assertFalse(cfg.open_browser)
        self.assertTrue(cfg.debug)
        self.assertIn("GRS_PORT", cfg.overrides)
        self.assertIn("GRS_DB", cfg.overrides)

    def test_missing_default_config_uses_builtin_defaults(self):
        cfg = load_config(root=self.temp_dir, env={})
        self.assertIsNone(cfg.source)
        self.assertEqual(cfg.host, "127.0.0.1")
        self.assertEqual(cfg.port, 8765)
        self.assertEqual(cfg.records_db, (self.temp_dir / "data/records.db").resolve())
        self.assertEqual(cfg.plans_db, (self.temp_dir / "data/plans.db").resolve())
        self.assertTrue(cfg.open_browser)
        self.assertFalse(cfg.debug)

    def test_invalid_configs_are_rejected(self):
        bad_values = [
            {"port": 0},
            {"port": 70000},
            {"port": True},
            {"open_browser": "sometimes"},
            {"debug": 1},
            {"unknown_key": True},
            {"records_db": "data/same.db", "plans_db": "data/same.db"},
        ]
        for data in bad_values:
            self.write_config(data)
            with self.assertRaises(ConfigError, msg=str(data)):
                load_config(self.config_path, env={})

    def test_utf8_bom_config_is_accepted(self):
        self.config_path.write_text(
            '\ufeff{"port": 9300, "open_browser": false}',
            encoding="utf-8",
        )
        cfg = load_config(self.config_path, env={})
        self.assertEqual(cfg.port, 9300)
        self.assertFalse(cfg.open_browser)

    def test_invalid_json_and_missing_explicit_file(self):
        self.config_path.write_text("{broken", encoding="utf-8")
        with self.assertRaises(ConfigError):
            load_config(self.config_path, env={})

        missing = self.temp_dir / "missing.json"
        with self.assertRaises(ConfigError):
            load_config(missing, env={})

    def test_invalid_environment_values_are_rejected(self):
        self.write_config({"port": 9100})
        for env in (
            {"GRS_PORT": "abc"},
            {"GRS_PORT": "0"},
            {"GRS_OPEN_BROWSER": "maybe"},
            {"GRS_DEBUG": "2"},
        ):
            with self.assertRaises(ConfigError, msg=str(env)):
                load_config(self.config_path, env=env)


if __name__ == "__main__":
    unittest.main()
