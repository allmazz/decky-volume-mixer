import json
import asyncio
import logging
import os
import re
import shutil
from asyncio.subprocess import Process
from typing import Coroutine, Any

import decky # type: ignore
from settings import SettingsManager # type: ignore
from helpers import get_user_id # type: ignore


class Plugin:
    _logger: logging.Logger
    _settings: SettingsManager
    _filters: list[re.Pattern]
    _pw_dump_bin: str
    _wpctl_bin: str
    _xdg_runtime_dir: str

    async def get_playbacks(self) -> list:
        proc = await self._create_subprocess_exec(self._pw_dump_bin)
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            self._logger.error(f"failed to get playbacks! pw-dump failed with code {proc.returncode}: {stderr.decode()}\n{stdout.decode()}")
            return []

        pw_dump = json.loads(stdout.decode())
        found_playbacks = []
        for node in pw_dump:
            if node.get("type") != "PipeWire:Interface:Node":
                continue

            info = node.get("info", {})
            props = info.get("props", {})
            if props.get("media.class") != "Stream/Output/Audio":
                continue

            if props.get("application.process.binary", "").lower() == "steamwebhelper" and props.get("application.name", "").lower() == "chromium":
                name = "Steam"
            else:
                name = (props.get("node.description")
                        or props.get("node.nick")
                        or props.get("application.name")
                        or props.get("node.name"))
            if not name or any(_filter.fullmatch(name) for _filter in self._filters):
                continue

            media_name = props.get("media.name", "")
            if media_name.lower() in [name.lower(), "playback", "playback stream", "output"]:
                media_name = None
            if not media_name and props.get("pipewire.client.access") == "flatpak":
                media_name = props.get("pipewire.access.portal.app_id")

            params_props = info.get("params", {}).get("Props", [])
            if len(params_props) == 0:
                continue
            volumes = params_props[0].get("channelVolumes", [])
            if len(volumes) == 0:
                continue
            volume = volumes[0]
            if props.get("client.api") == "pipewire-pulse": # convert pulse-audio cubic scaling to linear
                max_vol = 1.0 + round(self._settings.getSetting("boostLimit", 0) / 100, 2)
                volume = round(max(0.0, min(max_vol, volume ** (1/3))), 2)

            found_playbacks.append({
                "id": node["id"],
                "name": name[0].upper() + name[1:],
                "mediaName": media_name,
                "volume": int(volume * 100)
            })

        self._logger.debug(f"Found {len(found_playbacks)} playbacks")
        return sorted(
            found_playbacks,
            key=lambda playback: (playback["name"] == "Steam", -playback["id"])
        )

    async def set_volume(self, id: int, volume: int):
        volume = max(0, min(100 + self._settings.getSetting("boostLimit", 0), volume))
        vol_str = f"{volume / 100:.2f}"
        proc = await self._create_subprocess_exec(self._wpctl_bin, "set-volume", str(id), vol_str)
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            self._logger.error(f"failed to set volume of {id}! wpctl failed with code {proc.returncode}: {stderr.decode()}\n{stdout.decode()}")
            return False

        self._logger.info(f"Set volume of playback {id} to {vol_str}")
        return True

    async def get_settings(self):
        return {
            "filters": self._settings.getSetting("filters", []),
            "boostLimit": self._settings.getSetting("boostLimit", 0),
        }

    async def save_settings(self, settings: dict):
        compiled_filters = []
        for _filter in settings["filters"]:
            try:
                compiled_filters.append(re.compile(_filter))
            except re.error:
                return False

        self._settings.setSetting("filters", settings["filters"])
        self._filters = compiled_filters
        self._settings.setSetting("boostLimit", settings["boostLimit"])
        self._settings.commit()

        return True

    async def reset_volumes(self):
        playbacks = await self.get_playbacks()
        for playback in playbacks:
            await self.set_volume(playback["id"], 100)

    async def _main(self):
        self._logger = decky.logger
        self._settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)
        self._filters = []

        for _filter in self._settings.getSetting("filters", []):
            try:
                self._filters.append(re.compile(_filter))
            except re.error as e:
                self._logger.error(f"Failed to compile filter '{_filter}': {e}")

        self._pw_dump_bin = shutil.which("pw-dump") or ""
        if not self._pw_dump_bin:
            raise Exception("pw-dump not found in PATH, plugin cannot work without it")
        self._wpctl_bin = shutil.which("wpctl") or ""
        if not self._wpctl_bin:
            raise Exception("wpctl not found in PATH, plugin cannot work without it")
        self._logger.info(f"found pw-dump at {self._pw_dump_bin} and wpctl at {self._wpctl_bin}")

        self._xdg_runtime_dir = os.environ.get("XDG_RUNTIME_DIR") or ""
        if not self._xdg_runtime_dir:
            self._xdg_runtime_dir = f"/run/user/{get_user_id()}"
            self._logger.info(f"XDG_RUNTIME_DIR is not set, using {self._xdg_runtime_dir}")
        else:
            self._logger.info(f"found XDG_RUNTIME_DIR={self._xdg_runtime_dir}")

    async def _unload(self):
        pass

    def _create_subprocess_exec(self, *args, **kwargs) -> Coroutine[Any, Any, Process]:
        return asyncio.create_subprocess_exec(
            *args, **kwargs,
            env={**os.environ, "XDG_RUNTIME_DIR": self._xdg_runtime_dir},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
