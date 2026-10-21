"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { VenueDetailsForm } from "./VenueDetailsForm";
import consoleStyles from "./NightsHome.module.css";
import styles from "./Venues.module.css";

export function CreateVenue() {
  const router = useRouter();
  return <div className={styles.page}>
    <nav aria-label="Venue navigation" className={styles.breadcrumb}><Link href="/admin/venues">Venues</Link><span>/</span><span aria-current="page">Add venue</span></nav>
    <header className={consoleStyles.header}><div><h1>Add venue</h1><p>Add the place first, then schedule its nights.</p></div></header>
    <section className={`${styles.panel} ${styles.createForm}`}><VenueDetailsForm onSaved={venue => router.push(`/admin/venues/${venue.id}`)} /></section>
  </div>;
}
