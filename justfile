install:
    uv sync

run:
    uv run python app.py

sc-cookies browser="chrome":
    #!/usr/bin/env sh
    uv run yt-dlp \
        --cookies-from-browser {{browser}} \
        --cookies /tmp/_klub100_cookies.txt \
        --skip-download \
        "https://soundcloud.com/thexavytrain/ga-money" || true
    if [ ! -f /tmp/_klub100_cookies.txt ]; then
        echo "ERROR: could not read cookies from {{browser}}" && exit 1
    fi
    grep -E '^#|soundcloud' /tmp/_klub100_cookies.txt > sc_cookies.txt
    rm -f /tmp/_klub100_cookies.txt
    echo "Done — $(grep -c soundcloud sc_cookies.txt) SoundCloud cookies saved to sc_cookies.txt"

clean:
    rm -rf .venv uv.lock
