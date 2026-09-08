# Firebase Authentication Setup for TripBuddy

## Purpose and scope

TripBuddy remains a **static Netlify application**. Firebase Authentication will add an optional email-and-password account layer without replacing the existing Google Maps route calculation, route-report tabs, Netlify intelligence functions, or Food Buddy Bites editorial link. The initial rollout will leave route planning public; an authenticated identity can be used later to protect saved trips, sharing, donations, or higher-volume requests.

## Required Firebase console configuration

| Setting | Required action |
|---|---|
| Email/password provider | In Firebase Console, open **Authentication → Sign-in method**, enable **Email/Password**, and save. |
| Authorized domains | In **Authentication → Settings → Authorized domains**, add `urtripbuddy.app` and the Netlify preview domain if it will be used for testing. |
| Password policy | Set an appropriate password policy under **Authentication → Settings → Password policy**. Firebase supports a minimum length from 6 to 30 characters. |
| Email enumeration protection | Enable it when ready. The client deliberately uses neutral failure text so it does not rely on account-discovery error details. |

## App behavior

The header will expose an account action. A visitor can open a compact modal to create an account or sign in. New registrations call Firebase `createUserWithEmailAndPassword`, then request email verification. Sign-in calls Firebase `signInWithEmailAndPassword`. Authentication state is observed through Firebase so the header updates on sign-in, sign-out, and page reload.

> Firebase’s client configuration identifies the Firebase project; it is not treated as a server secret. Security for protected data must be enforced through Firebase Security Rules and server-side token verification when protected Netlify functions or databases are added later.

## Safeguards

The client validates that passwords are at least eight characters before submitting them. It does not store passwords, authentication tokens, or email addresses in TripBuddy’s local application code. Errors are presented as neutral, user-friendly messages. The existing public route flow is intentionally unchanged in this version.

## Local validation

The locally served static page loaded with its existing TripBuddy map, route controls, top-level GPS/Camping/Emergency tabs, and Food Buddy Bites editorial link intact. The added **Sign In** header action opened an accessible account dialog with email and password fields, a create-account mode, a password-reset option, and an explicit statement that public route planning remains available without an account.

The create-account mode was also verified locally. It changes the dialog title, explanatory text, submit action, and password autocomplete semantics while retaining the unobtrusive account flow. No test Firebase account was created during this validation.

Client-side password validation was confirmed with an intentionally short test password. The form displayed **“Use at least 8 characters for your password.”** and did not submit a registration request.

The dialog successfully returned to the standard sign-in state with email-and-password fields and the password-reset option visible. The local browser console contained no Firebase or account-interface errors; its messages were existing Google Maps deprecation/loading warnings from the original TripBuddy mapping integration.

## References

[1]: https://firebase.google.com/docs/auth/web/password-auth "Firebase: Authenticate with password-based accounts on the web"
[2]: https://firebase.google.com/docs/web/setup "Firebase: Add Firebase to a JavaScript project"
