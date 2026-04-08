import {
    ButtonItem,
    PanelSection,
    PanelSectionRow,
    SliderField,
    Focusable,
    DialogButton,
    staticClasses,
    showModal,
} from "@decky/ui";
import {
    callable,
    definePlugin,
    toaster,
} from "@decky/api"

import {useEffect, useRef, useState} from "react";
import {FaSlidersH} from "react-icons/fa";
import {BsGearFill} from "react-icons/bs";

import {SettingsModal, Settings} from "./settings";


interface Playback {
    id: number,
    name: string,
    volume: number,
    mediaName: string | null
}

const getPlaybacks = callable<[], Playback[]>("get_playbacks");
const setVolume = callable<[number, number], boolean>("set_volume");
const resetVolumes = callable<[], void>("reset_volumes");
const getSettings = callable<[], Settings>("get_settings");
const saveSettings = callable<[Settings], boolean>("save_settings");

function Content() {
    const [settings, setSettings] = useState<Settings>();
    const [playbacks, setPlaybacks] = useState<Playback[]>([]);
    const lastChanged = useRef(0);

    useEffect(() => {
        let alive = true;

        const load = async () => {
            try {
                const data = await getSettings();
                if (alive) setSettings(data);
            } catch (e) {
                toaster.toast({title: "Volume Mixer", body: "Failed to get settings", critical: true});
                console.error(e);
            }
        }
        load();

        return () => {alive = false}
    }, [])

    useEffect(() => {
        let alive = true;

        const load = async () => {
            if (!alive) return;

            if (Date.now() - lastChanged.current < 2000) {
                setTimeout(load, 1000);
                return;
            }

            try {
                const data = await getPlaybacks();
                if (alive) {
                    setPlaybacks(data);
                    setTimeout(load, 1000);
                }
            } catch (e) {
                toaster.toast({title: "Volume Mixer", body: "Failed to load playbacks", critical: true});
                console.error(e);
            }
        };
        load();

        return () => {alive = false};
    }, []);

    const onVolumeChange = async (id: number, volume: number) => {
        lastChanged.current = Date.now();
        setPlaybacks(prev => prev.map(p => p.id === id ? {...p, volume} : p));
        if (!(await setVolume(id, volume))) {
            toaster.toast({title: "Volume Mixer", body: "Failed to set volume", critical: true});
        }
    };

    const onResetClicked = async () => {
        lastChanged.current = Date.now();
        setPlaybacks(prev => prev.map(p => ({...p, volume: 100})));
        await resetVolumes().catch(() => toaster.toast({title: "Volume Mixer", body: "Failed to reset volumes", critical: true}))
    }

    return (
        <PanelSection>
            {playbacks.map((playback, i, all) => (
                <PanelSectionRow key={playback.id}>
                    <SliderField bottomSeparator={i === all.length - 1 ? "standard" : "none"}
                                 showValue
                                 editableValue
                                 label={playback.name}
                                 description={playback.mediaName?.slice(0, 44)}
                                 min={0} max={100 + (settings?.boostLimit ?? 0)} step={1}
                                 value={playback.volume}
                                 onChange={(volume) => onVolumeChange(playback.id, volume)}
                    />
                </PanelSectionRow>
            ))}
            <PanelSectionRow>
                {playbacks.length > 0 ?
                    <ButtonItem bottomSeparator="none" layout="below" onClick={onResetClicked}>
                        Reset
                    </ButtonItem> :
                    <div className={staticClasses.PanelSectionTitle}
                         style={{textAlign: "center", display: "block", marginTop: "11px"}}>
                        Nothing is playing
                    </div>
                }
            </PanelSectionRow>
        </PanelSection>
    );
}

function TitleView() {
    return (
        <Focusable style={{display: "flex", padding: 0, width: "100%", justifyContent: "space-between"}}>
            <div className={staticClasses.Title} style={{padding: 0}}>Volume Mixer</div>
            <DialogButton
                style={{height: '28px', width: '40px', minWidth: 0, padding: '10px 12px'}}
                onClick={() => showModal(<SettingsModal getSettings={getSettings} onSave={saveSettings}/>)}
            >
                <BsGearFill style={{marginTop: '-4px', display: 'block'}}/>
            </DialogButton>
        </Focusable>
    )
}

export default definePlugin(() => {
    return {
        name: "Volume Mixer",
        titleView: <TitleView/>,
        content: <Content/>,
        icon: <FaSlidersH/>,
    };
});
