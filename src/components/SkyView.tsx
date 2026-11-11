"use client";

import AppNav from "./AppNav";
import MeaningSky from "./MeaningSky";
import styles from "./SkyView.module.css";

export default function SkyView() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>꿈 시스템</h1>
        <AppNav />
      </header>
      <main className={styles.main}>
        <MeaningSky />
      </main>
    </div>
  );
}
