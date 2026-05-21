#!/usr/bin/env fish
# @fish-lsp-disable 7001

for name in RENDER_JOB_ID RENDER_INTERNAL_URL RENDER_WIDTH RENDER_HEIGHT RENDER_FRAMERATE RENDER_BITRATE
    if not set -q $name; or test -z "$$name"
        echo "missing $name" >&2
        exit 1
    end
end

set -g WORKDIR "/workspace/render-$RENDER_JOB_ID"
set -g SOURCE_FILE "$WORKDIR/scene.py"
set -g MEDIA_DIR "$WORKDIR/media"
set -g STDOUT_FILE "$WORKDIR/stdout.log"
set -g STDERR_FILE "$WORKDIR/stderr.log"

mkdir -p "$WORKDIR" "$MEDIA_DIR"; or exit
printf "" >"$STDOUT_FILE"; or exit
printf "" >"$STDERR_FILE"; or exit

for name in RENDER_WIDTH RENDER_HEIGHT RENDER_FRAMERATE RENDER_BITRATE
    if not string match -qr '^[1-9][0-9]*$' -- "$$name"
        echo "invalid render constraint $name: $$name" >&2
        exit 1
    end
end

function download_source
    curl \
        --fail \
        --silent \
        --show-error \
        --location \
        --output "$SOURCE_FILE" \
        "$RENDER_INTERNAL_URL/source"
end

function stream_log
    set -l stream_name "$argv[1]"
    set -l file "$argv[2]"
    set -l watched_pid "$argv[3]"

    tail -n +1 --follow=name "--pid=$watched_pid" "$file" \
        | curl \
        --fail \
        --silent \
        --show-error \
        --location \
        --request POST \
        --header "Content-Type: text/plain; charset=utf-8" \
        --data-binary @- \
        "$RENDER_INTERNAL_URL/log/$stream_name"
end

function upload_output
    curl \
        --fail \
        --silent \
        --show-error \
        --location \
        --request PUT \
        --header "Content-Type: video/mp4" \
        --data-binary @- \
        "$RENDER_INTERNAL_URL/output"
end

function finish_render
    set -l finish_status "$argv[1]"
    set -l exit_code "$argv[2]"
    set -l payload (printf '{"status":"%s","exitCode":%s}' "$finish_status" "$exit_code")

    curl \
        --fail \
        --silent \
        --show-error \
        --location \
        --request POST \
        --header "Content-Type: application/json" \
        --data "$payload" \
        "$RENDER_INTERNAL_URL/finish"
end

function run_render
    echo "downloading render source from $RENDER_INTERNAL_URL/source"
    download_source; or return $status

    set -l video_size (printf '%sx%s' "$RENDER_WIDTH" "$RENDER_HEIGHT")

    printf 'streaming raw %s RGBA frames at %s fps\n' "$video_size" "$RENDER_FRAMERATE"
    manim \
        --write_to_stdout \
        --progress_bar none \
        --media_dir "$MEDIA_DIR" \
        --fps "$RENDER_FRAMERATE" \
        -r "$RENDER_WIDTH,$RENDER_HEIGHT" \
        -a "$SOURCE_FILE" \
        | ffmpeg \
        -y \
        -f rawvideo \
        -pix_fmt rgba \
        -video_size "$video_size" \
        -framerate "$RENDER_FRAMERATE" \
        -i pipe:0 \
        -r "$RENDER_FRAMERATE" \
        -b:v "$RENDER_BITRATE" \
        -pix_fmt yuv420p \
        -movflags frag_keyframe+empty_moov+default_base_moof \
        -f mp4 \
        pipe:1 \
        | upload_output

    set -l stream_status $pipestatus
    if test "$stream_status[1]" -ne 0
        return "$stream_status[1]"
    end
    if test "$stream_status[2]" -ne 0
        return "$stream_status[2]"
    end
    if test "$stream_status[3]" -ne 0
        return "$stream_status[3]"
    end
end

run_render >"$STDOUT_FILE" 2>"$STDERR_FILE" &
set -l render_pid $last_pid

stream_log stdout "$STDOUT_FILE" "$render_pid" &
set -l stdout_stream_pid $last_pid

stream_log stderr "$STDERR_FILE" "$render_pid" &
set -l stderr_stream_pid $last_pid

wait "$render_pid"
set -l render_exit $status

wait "$stdout_stream_pid"
wait "$stderr_stream_pid"

set -l finish_status succeed
if test "$render_exit" -ne 0
    set finish_status failed
end

finish_render "$finish_status" "$render_exit" >>"$STDOUT_FILE" 2>>"$STDERR_FILE"; or exit $status

exit "$render_exit"
