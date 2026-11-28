# The reservation page reads as an invitation: hook, one event card, then the form

**Decision (2026-11-28, #606):** the public event page (`/events/[nightId]`) opens on one
hook line ("Boire un verre, et savoir si tu lui plais aussi."), then one card with the
day and hours, the venue and its address, "Entrée gratuite" with the deposit in the same
line, and one reassurance line ("Personne ne peut t'écrire tant que tu n'as pas liké en
retour."). The form follows directly. The French guest copy says "tu". The button is a
plain "Réserver ma place"; the deposit and its refund are written on the line just above
it. Remaining places are shown only when 5 or fewer are left. An empty submit names each
missing field under the field and in one summary above the button. A full evening points
to the Instagram account (`@amouretteapp`) for the next dates.

**Why:** visitors arrive from a street QR code or Instagram, women first, often after the
landing page. The old page read like a form: no word on what the evening is, a formal
"vous", and a button ("Réserver avec une caution de 10,00 €") that read like a price.
Marwane chose each part from variants, one part at a time:

- No printed ticket like the landing: a visitor who taps "Réserver" on the landing and
  sees the same ticket again feels they have not moved forward.
- The longer explanation and the three reassurance lines were dropped from the page; one
  line in the card keeps the promise that matters most before the email is asked.
- "Il reste 20 places" at opening reads as an empty evening and discourages; a count is
  honest urgency only when it is small.
- "Uniquement pour équilibrer la soirée. Personne d'autre ne le voit." over-justified the
  gender question; "Pour équilibrer la soirée." stays, since a question about gender with
  no reason can surprise. The privacy policy still says it is never shown to guests.

**Unchanged:** reservation, deposit, cancellation and refund rules, form fields and their
validation contract, consent, legal links and the Stripe mention. Every value on the page
comes from the night configured in admin; the displayed hours are the night's start and
end. The reservation conditions page keeps its formal register.
