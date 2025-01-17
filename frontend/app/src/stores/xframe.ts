import { writable } from "svelte/store";
import type { Theme } from "../theme/types";
import page from "page";
import { setModifiedTheme } from "../theme/themes";
import { routerReady } from "../routes";

const FRAME_ANCESTORS = [
    "http://localhost:5173",
    "https://calm-pasca-49d7be.netlify.app", // betbase proof of concept
    "https://221bravo.app",
    "https://ht7v7-iaaaa-aaaak-qakga-cai.icp0.io", //221bravo
    "https://mdocx-gyaaa-aaaak-qcbsq-cai.icp0.io",
    "https://zexzi-jyaaa-aaaam-abj3q-cai.icp0.io", //Betbase dev
    "https://xw4dq-4yaaa-aaaam-abeuq-cai.ic0.app", //Betbase live
    "https://kjfeq-waaaa-aaaan-qedva-cai.icp0.io", // vaultbet test
    "https://spyzr-gqaaa-aaaan-qd66q-cai.icp0.io", // vaultbet
];

type XFrameMessage = UpdateTheme | ChangeRoute;

type UpdateTheme = {
    kind: "update_theme";
    name: string;
    base: "light" | "dark";
    overrides: Partial<Theme>;
};

type ChangeRoute = {
    kind: "change_route";
    path: string;
};

export const framed = writable(false);

export function init() {
    if (window.self !== window.top) {
        console.debug("XFRAME_TARGET: setting listeners", window.top);
        window.addEventListener("message", externalMessage);
        if (window.top) {
            console.debug("XFRAME_TARGET: sending ready message");
            window.top.postMessage("openchat_ready", "*");
        }
    }
}

init();

let queuedRoute: string | undefined = undefined;
let isRouterReady = false;

routerReady.subscribe((ready) => {
    console.debug("XFRAME_TARGET: routerReady changed to ", ready, queuedRoute);
    if (ready && queuedRoute !== undefined) {
        page(queuedRoute);
        queuedRoute = undefined;
    }
    isRouterReady = ready;
});

function externalMessage(ev: MessageEvent) {
    if (!FRAME_ANCESTORS.includes(ev.origin)) {
        return;
    }

    console.debug("XFRAME_TARGET: message received from host", ev);
    if (ev.data) {
        try {
            const payload = ev.data as XFrameMessage;
            switch (payload.kind) {
                case "change_route":
                    if (isRouterReady) {
                        console.debug("XFRAME_TARGET: changing path to ", payload.path);
                        page(payload.path);
                    } else {
                        console.debug("XFRAME_TARGET: queueing route change ", payload.path);
                        queuedRoute = payload.path;
                    }
                    break;
                case "update_theme":
                    setModifiedTheme(payload.base, payload.name, payload.overrides);
                    break;
            }
        } catch (err) {
            console.debug(
                "XFRAME_TARGET: Error handling an external message from another window",
                err,
            );
        }
    }
}
