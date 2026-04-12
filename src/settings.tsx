import {
    ConfirmModal,
    DialogButton,
    Focusable,
    SliderField,
    TextField,
    ModalRootProps,
    staticClasses,
} from "@decky/ui";
import {toaster} from "@decky/api";

import {useRef, useState, useEffect} from "react";
import {FaMinus, FaPlus} from "react-icons/fa";


export interface Settings {
    filters: string[]
    boostLimit: number
}


type SettingsModalInputRowProps = {
    isForNewFilter: boolean
    value: string
    onValueChanged: (value: string) => void
    onClick: () => void
}

const SettingsModalInputRow = (props: SettingsModalInputRowProps) => {
    const ref = useRef(null);

    return (
        <Focusable style={{display: "flex", paddingTop: "8px"}}>
            <div style={{width: "100%"}}>
                <TextField
                    // @ts-ignore
                    ref={ref}
                    value={props.value}
                    onChange={(e) => props.onValueChanged(e.target.value)}
                />
            </div>
            <DialogButton disabled={props.value === "" && props.isForNewFilter}
                          style={{
                              width: '40px',
                              minWidth: 0,
                              padding: '10px 12px',
                              borderRadius: 0,
                          }}
                          onClick={() => {
                              props.onClick();
                              // @ts-ignore
                              if (props.isForNewFilter && ref.current) ref.current.Focus();
                          }}>
                {props.isForNewFilter ? <FaPlus style={{display: 'block'}}/> : <FaMinus style={{display: 'block'}}/>}
            </DialogButton>
        </Focusable>
    );
}

export type SettingsModalProps = ModalRootProps & {
    getSettings: () => Promise<Settings>,
    onSave: (settings: Settings) => Promise<boolean>,
}

type SettingsModalInputRowValue = {
    key: number,
    value: string,
}

export const SettingsModal = (props: SettingsModalProps) => {
    const nextFilterId = useRef<number>(0);
    const [filters, setFilters] = useState<SettingsModalInputRowValue[]>([]);
    const [newFilterValue, setNewFilterValue] = useState<string>("");

    const newFilterOnClick = () => {
        setFilters(prev => [...prev, {key: nextFilterId.current++, value: newFilterValue}]);
        setNewFilterValue("");
    }
    const onFilterChanged = (key: number, value: string) => {
        setFilters(prev => prev.map(v => v.key === key ? {...v, value} : v));
    }
    const deleteFilterOnClick = (key: number) => {
        setFilters(prev => prev.filter((v) => v.key !== key));
    }


    const [boostLimit, setBoostLimit] = useState<number>(0);


    const saveBtnOnClick = async () => {
        const res = await props.onSave({
            filters: filters.filter((v) => v.value !== "").map(v => v.value),
            boostLimit: boostLimit,
        });
        toaster.toast({
            title: "Volume Mixer",
            body: res ? "Settings saved successfully" : "Failed to save settings, check values and try again",
            critical: !res,
        });
    }


    useEffect(() => {
        let alive = true;

        const load = async () => {
            try {
                const data = await props.getSettings();
                if (alive) {
                    setFilters(data.filters.map(filter => ({key: nextFilterId.current++, value: filter})));
                    setBoostLimit(data.boostLimit);
                }
            } catch (e) {
                toaster.toast({title: "Volume Mixer", body: "Failed to get settings", critical: true});
                console.error(e);
            }
        }
        load();

        return () => {alive = false};
    }, []);


    return (
        <ConfirmModal
            {...props}
            strTitle="Mixer settings"
            strOKButtonText="Save"
            strCancelButtonText="Cancel"
            onOK={saveBtnOnClick}
        >
            <Focusable>
                <span className={staticClasses.PanelSectionTitle}>Playback filters</span>
                <span>Regular expressions in Python format to exclude playbacks from the list</span>
                <SettingsModalInputRow key="new-filter"
                                       isForNewFilter={true}
                                       value={newFilterValue}
                                       onValueChanged={setNewFilterValue}
                                       onClick={newFilterOnClick}
                />
                {filters.map((filter) =>
                    <SettingsModalInputRow key={filter.key}
                                           isForNewFilter={false}
                                           value={filter.value}
                                           onValueChanged={(v) => onFilterChanged(filter.key, v)}
                                           onClick={() => deleteFilterOnClick(filter.key)}
                    />
                )}
            </Focusable>
            <Focusable style={{marginTop: "20px"}}>
                <SliderField bottomSeparator="none"
                             showValue
                             editableValue
                             label="Boost limit"
                             description="Set to 0 to disable boost"
                             min={0} max={100} step={5}
                             value={boostLimit}
                             onChange={setBoostLimit}
                />
            </Focusable>
        </ConfirmModal>
    );
};
