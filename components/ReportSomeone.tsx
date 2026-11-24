"use client";

import { Modal } from "@/components/ui/modal";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import type { SeenPerson } from "@/lib/report";

type Strings = {
  reportSomeoneTitle: string;
  reportSomeoneBody: string;
  reportSomeoneEmpty: string;
  reportSomeoneChoose: (name: string) => string;
  reportCancel: string;
};

// "Report someone from tonight" (#482): independent of the feed and of any
// match, so a block, a departure, a hidden profile or a pending correction
// never removes the only way to report.
export function ReportSomeone({ people, nameOf, onPick, onClose, s }: {
  people: SeenPerson[];
  nameOf: (person: SeenPerson) => string;
  onPick: (person: SeenPerson) => void;
  onClose: () => void;
  s: Strings;
}) {
  return (
    <Modal onClose={onClose} showClose={false} overlayClassName="z-50" labelledById="report-someone-title">
      <h2 id="report-someone-title" className="font-display text-2xl font-medium text-cream">
        {s.reportSomeoneTitle}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-taupe">
        {people.length > 0 ? s.reportSomeoneBody : s.reportSomeoneEmpty}
      </p>
      {people.length > 0 && (
        <ul data-testid="report-someone-list" className="mt-5 grid max-h-[50dvh] gap-2 overflow-y-auto overscroll-contain">
          {people.map((person) => {
            const name = nameOf(person);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-label={s.reportSomeoneChoose(name)}
                  onClick={() => onPick(person)}
                  className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-champagne/20 bg-velvet/40 p-2 pr-4 text-left transition-colors hover:border-champagne/45"
                >
                  <ProfilePhoto circular profileId={person.id} src={person.photo_url} alt=""
                    loading="lazy" decoding="async"
                    className="night-photo-ring h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere] text-base text-cream">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="night-button night-button-secondary mt-6 w-full px-5 py-3"
      >
        {s.reportCancel}
      </button>
    </Modal>
  );
}
