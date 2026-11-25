#!/bin/sh
# Sign-in helper for YOU (the candidate) to run. Claude never types, pastes or creates
# passwords; it opens the sign-in or create-account page with your email filled in and
# hands the password step to you. In Claude Code, run this with "!" in front.
#
#   ./setup/signin.sh <site>       copy the saved password for <site> to the clipboard
#   ./setup/signin.sh new <site>   generate a strong password, save it in the Keychain as
#                                  jobhunt:<site>, and copy it (for a create-account page)
#   ./setup/signin.sh list         list the sites that have a saved password
#
# Then click the password box in the open tab and press Cmd+V (twice on create-account
# pages: password and confirm). The clipboard is wiped after 30 seconds.
# Workday sites use the name <company>-workday, e.g. ./setup/signin.sh att-workday
set -e
wipe_later() { ( sleep 30; printf '' | pbcopy ) >/dev/null 2>&1 & }

case "$1" in
  ""|-h|--help)
    sed -n 2,15p "$0"; exit 0 ;;
  list)
    security dump-keychain 2>/dev/null | grep -o '"svce"<blob>="jobhunt:[^"]*"' | sed 's/.*="jobhunt:\(.*\)"/\1/' | sort -u
    exit 0 ;;
  new)
    site="$2"; [ -n "$site" ] || { echo "usage: ./setup/signin.sh new <site>"; exit 1; }
    email="${3:-$(python3 -c 'import json;print(json.load(open("config/profile.json"))["email"])' 2>/dev/null)}"
    [ -n "$email" ] || { echo "No email: pass it as the third argument."; exit 1; }
    if security find-generic-password -s "jobhunt:$site" >/dev/null 2>&1; then
      echo "jobhunt:$site already exists. Use ./setup/signin.sh $site to copy it."; exit 1
    fi
    # 20 chars with upper, lower, digit and symbol (most sites require all four).
    pw=$(python3 -c 'import secrets,string as s;a=s.ascii_letters+s.digits+"!@#%^*-_";p=[secrets.choice(c) for c in (s.ascii_uppercase,s.ascii_lowercase,s.digits,"!@#%^*-_")]+[secrets.choice(a) for _ in range(16)];secrets.SystemRandom().shuffle(p);print("".join(p))')
    security add-generic-password -s "jobhunt:$site" -a "$email" -w "$pw"
    printf '%s' "$pw" | pbcopy; unset pw; wipe_later
    echo "New password saved as jobhunt:$site ($email) and copied. Paste it into both password boxes (Cmd+V). Clipboard clears in 30 s."
    exit 0 ;;
  *)
    site="$1"
    for svc in "jobhunt:$site" "jobhunt:$site-workday"; do
      if pw=$(security find-generic-password -s "$svc" -w 2>/dev/null); then
        acct=$(security find-generic-password -s "$svc" 2>/dev/null | sed -n 's/.*"acct"<blob>="\(.*\)"/\1/p')
        printf '%s' "$pw" | pbcopy; unset pw; wipe_later
        echo "Password for $svc ($acct) copied. Click the password box and press Cmd+V. Clipboard clears in 30 s."
        exit 0
      fi
    done
    echo "No saved password for '$site'. ./setup/signin.sh list shows saved sites; ./setup/signin.sh new $site creates one."
    exit 1 ;;
esac
