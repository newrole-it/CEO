/**
 * Strings for mail from Gmail: Settings → Gmail, the panel above the tracker and the timeline.
 * Keys start with "gm.", except the ones that join an existing family.
 * Polish uses the informal, capitalised "Ty". Every key in gmailPl must exist in gmailEn.
 */
export const gmailPl = {
  "app.source.gmail": "Gmail",
  "app.ev.via.gmail": "z Gmaila",
  "app.ev.mail": "Wiadomość",

  "gm.title": "Gmail",
  "gm.lead":
    "Nowa Rola nie przeszukuje Twojej skrzynki. Gdy firma odpisze, wskazujesz ten jeden mail w rozszerzeniu, a status aplikacji i oś czasu zmieniają się po Twoim potwierdzeniu.",
  "gm.how.1.title": "Otwórz mail od firmy",
  "gm.how.1.body":
    "W Gmailu otwórz wiadomość, np. zaproszenie na kolejny etap albo odmowę. W długim wątku możesz zaznaczyć fragment, o który chodzi.",
  "gm.how.2.title": "Kliknij rozszerzenie Nowa Rola",
  "gm.how.2.body":
    "Wybierz „Użyj tego maila w aplikacji”. Rozszerzenie podpowie aplikację i nowy status na podstawie nadawcy i treści.",
  "gm.how.3.title": "Potwierdź",
  "gm.how.3.body":
    "Popraw aplikację albo status, jeśli trzeba, i zapisz. Temat maila trafi na oś czasu, a zmianę statusu cofniesz na liście aplikacji.",

  "gm.reads.title": "Co jest czytane",
  "gm.reads.1":
    "Tylko otwarta wiadomość i tylko po kliknięciu. Rozszerzenie nie ma stałego dostępu do Gmaila, a aplikacja nie ma tokenu do Twojej skrzynki.",
  "gm.reads.2":
    "Treść służy do odczytania decyzji (reguły, a gdy nie wystarczą, model językowy, bez linków, adresów i telefonów) i nie jest zapisywana. Zostają nadawca, temat, data, zdanie z uzasadnieniem i Twój wybór.",
  "gm.reads.3": "Wpisy w dzienniku poniżej znikają po 90 dniach.",

  "gm.legacy":
    "Skrzynka {email} została połączona we wcześniejszej wersji. Nowa Rola już jej nie czyta, ale token dostępu wciąż jest zapisany. Odłącz ją, żeby go odwołać.",
  "gm.disconnect": "Odłącz i odwołaj dostęp",
  "gm.disconnected": "Odłączono Gmail. Dostęp odwołany, dziennik usunięty.",
  "gm.disconnectedManual":
    "Odłączono Gmail i usunięto dziennik, ale Google nie potwierdził odwołania dostępu. Usuń je ręcznie na swoim koncie Google.",
  "gm.permissions": "Uprawnienia konta Google",
  "gm.loadError": "Nie udało się wczytać ustawień Gmaila.",
  "gm.result.off":
    "Łączenie skrzynki zostało wyłączone. Otwórz mail w Gmailu i użyj go przez rozszerzenie.",

  "gm.log.title": "Użyte maile ({n})",
  "gm.log.lead": "Maile wskazane w rozszerzeniu i to, co z nimi zrobiono.",
  "gm.log.empty": "Jeszcze żaden mail nie został użyty.",
  "gm.log.byModel": "ocena modelu",
  "gm.log.byRules": "reguły",

  "gm.signal.CONFIRMATION": "Potwierdzenie aplikacji",
  "gm.signal.NEXT_STAGE": "Kolejny etap",
  "gm.signal.SCREENING": "Rozmowa z rekruterem",
  "gm.signal.INTERVIEW": "Rozmowy",
  "gm.signal.TASK": "Zadanie",
  "gm.signal.FINAL": "Rozmowa finałowa",
  "gm.signal.OFFER": "Oferta",
  "gm.signal.REJECTED": "Odrzucenie",
  "gm.signal.OTHER": "Bez decyzji",

  "gm.outcome.APPLIED": "Zmieniono status",
  "gm.outcome.CREATED": "Dodano aplikację",
  "gm.outcome.NOTED": "Na osi czasu",
  "gm.outcome.PENDING": "Do potwierdzenia",
  "gm.outcome.IGNORED": "Pominięto",
  "gm.outcome.DISMISSED": "Odrzucono przez Ciebie",
  "gm.outcome.UNDONE": "Cofnięto",

  "gm.inbox.label": "Wiadomości z Gmaila",
  "gm.inbox.pending": "Do potwierdzenia ({n})",
  "gm.inbox.recent": "Zmienione z maila",
  "gm.inbox.apply": "Zastosuj",
  "gm.inbox.add": "Dodaj do trackera",
  "gm.inbox.skip": "Pomiń",
  "gm.inbox.undo": "Cofnij",
  "gm.inbox.choose": "Której aplikacji dotyczy?",
  "gm.inbox.choosePh": "Wybierz aplikację",
  "gm.inbox.unassigned": "Bez przypisanej aplikacji",
  "gm.inbox.unverified":
    "Google nie potwierdził nadawcy. Ten mail może być podszyty, więc sprawdź go, zanim zastosujesz zmianę.",
  "gm.inbox.applied": "Zapisano.",
  "gm.inbox.undone": "Cofnięto zmianę.",
  "gm.inbox.error": "Nie udało się tego zapisać. Spróbuj ponownie.",
  "gm.inbox.settings": "Jak używać maili z Gmaila",
}

export const gmailEn: Record<keyof typeof gmailPl, string> = {
  "app.source.gmail": "Gmail",
  "app.ev.via.gmail": "from Gmail",
  "app.ev.mail": "Message",

  "gm.title": "Gmail",
  "gm.lead":
    "Nowa Rola does not search your mailbox. When a company replies, you point the extension at that one message, and the application's status and timeline change once you confirm.",
  "gm.how.1.title": "Open the company's mail",
  "gm.how.1.body":
    "Open the message in Gmail, e.g. an invitation to the next stage or a rejection. In a long thread you can select the part that matters.",
  "gm.how.2.title": "Click the Nowa Rola extension",
  "gm.how.2.body":
    "Choose “Użyj tego maila w aplikacji”. The extension suggests the application and the new status from the sender and the text.",
  "gm.how.3.title": "Confirm",
  "gm.how.3.body":
    "Fix the application or the status if needed, and save. The subject goes on the timeline, and the status change can be undone on the applications list.",

  "gm.reads.title": "What gets read",
  "gm.reads.1":
    "Only the open message, and only after a click. The extension has no standing access to Gmail, and the app holds no token to your mailbox.",
  "gm.reads.2":
    "The text is used to read the decision (rules, then a language model when they are not enough, without links, addresses or phone numbers) and is not stored. Sender, subject, date, one sentence behind the reading and your choice are kept.",
  "gm.reads.3": "Entries in the log below disappear after 90 days.",

  "gm.legacy":
    "The mailbox {email} was connected in an earlier version. Nowa Rola no longer reads it, but its access token is still stored. Disconnect it to revoke the token.",
  "gm.disconnect": "Disconnect and revoke access",
  "gm.disconnected": "Gmail disconnected. Access revoked, log deleted.",
  "gm.disconnectedManual":
    "Gmail is disconnected and the log deleted, but Google did not confirm the revocation. Remove the access by hand in your Google account.",
  "gm.permissions": "Google account permissions",
  "gm.loadError": "Could not load the Gmail settings.",
  "gm.result.off":
    "Connecting a mailbox has been turned off. Open the mail in Gmail and use it through the extension.",

  "gm.log.title": "Messages used ({n})",
  "gm.log.lead": "Messages you picked in the extension, and what was done with them.",
  "gm.log.empty": "No message has been used yet.",
  "gm.log.byModel": "model",
  "gm.log.byRules": "rules",

  "gm.signal.CONFIRMATION": "Application confirmed",
  "gm.signal.NEXT_STAGE": "Next stage",
  "gm.signal.SCREENING": "Recruiter screen",
  "gm.signal.INTERVIEW": "Interviews",
  "gm.signal.TASK": "Take-home task",
  "gm.signal.FINAL": "Final interview",
  "gm.signal.OFFER": "Offer",
  "gm.signal.REJECTED": "Rejection",
  "gm.signal.OTHER": "No decision",

  "gm.outcome.APPLIED": "Status changed",
  "gm.outcome.CREATED": "Application added",
  "gm.outcome.NOTED": "On the timeline",
  "gm.outcome.PENDING": "To confirm",
  "gm.outcome.IGNORED": "Skipped",
  "gm.outcome.DISMISSED": "Skipped by you",
  "gm.outcome.UNDONE": "Undone",

  "gm.inbox.label": "Messages from Gmail",
  "gm.inbox.pending": "To confirm ({n})",
  "gm.inbox.recent": "Changed from mail",
  "gm.inbox.apply": "Apply",
  "gm.inbox.add": "Add to tracker",
  "gm.inbox.skip": "Skip",
  "gm.inbox.undo": "Undo",
  "gm.inbox.choose": "Which application is this about?",
  "gm.inbox.choosePh": "Choose an application",
  "gm.inbox.unassigned": "No application assigned",
  "gm.inbox.unverified":
    "Google could not vouch for the sender. This mail may be forged, so check it before applying the change.",
  "gm.inbox.applied": "Saved.",
  "gm.inbox.undone": "Change undone.",
  "gm.inbox.error": "That could not be saved. Try again.",
  "gm.inbox.settings": "How to use mail from Gmail",
}
