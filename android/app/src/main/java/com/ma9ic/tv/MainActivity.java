package com.ma9ic.tv;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "Ma9icTV";
    private LocalApiServer localApiServer;

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
    public void onDestroy() {
        if (localApiServer != null) {
            localApiServer.stop();
            localApiServer = null;
        }
        super.onDestroy();
    }
}
