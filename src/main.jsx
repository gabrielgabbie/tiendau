import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { t, htmlLang } from "@/core/index.js";
import { init } from "@/data/store.js";
import { applyTheme, prefs } from "@/lib/model.js";
import App from "./App.jsx";

applyTheme();
document.documentElement.lang = htmlLang(prefs.lang);
createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
init().catch((e) => { console.error(e); toast(t("Couldn't start. Check your connection and reload.")); });
