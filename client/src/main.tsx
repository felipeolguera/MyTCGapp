import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "./App";
import "./styles.css";

async function applyNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#07090d" });
  } catch {
    // Web / unsupported platforms ignore status bar styling.
  }
}

void applyNativeChrome();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
