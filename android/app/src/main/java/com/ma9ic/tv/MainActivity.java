package com.ma9ic.tv;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "Ma9icTV";
    private LocalApiServer localApiServer;
    private long backPressedAt = 0L;
    private static final long EXIT_HOLD_MS = 1400L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Start the loopback bridge before Capacitor creates/loads the WebView.
        // The first playlist, EPG and playback requests can happen immediately
        // as the bundled JavaScript starts, so starting after super.onCreate()
        // creates a race where all three can fail on a cold launch.
        try {
            localApiServer = new LocalApiServer();
            localApiServer.start(LocalApiServer.SOCKET_READ_TIMEOUT, false);
            Log.i(TAG, "Embedded API started at http://127.0.0.1:8765");
        } catch (Exception error) {
            Log.e(TAG, "Could not start embedded API at http://127.0.0.1:8765", error);
            localApiServer = null;
        }
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) backPressedAt = SystemClock.elapsedRealtime();
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                long heldMs = backPressedAt == 0L ? 0L : SystemClock.elapsedRealtime() - backPressedAt;
                backPressedAt = 0L;
                if (heldMs >= EXIT_HOLD_MS) {
                    finishAndRemoveTask();
                } else if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new Event('ma9ictv-back'))", null));
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onDestroy() {
        if (localApiServer != null) {
            localApiServer.stop();
            localApiServer = null;
        }
        super.onDestroy();
    }
}
