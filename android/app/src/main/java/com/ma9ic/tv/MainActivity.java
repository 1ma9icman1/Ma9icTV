package com.ma9ic.tv;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private LocalApiServer localApiServer;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            localApiServer = new LocalApiServer();
            localApiServer.start(LocalApiServer.SOCKET_READ_TIMEOUT, false);
        } catch (Exception error) {
            android.util.Log.e("Ma9icTV", "Could not start embedded API", error);
        }
    }

    @Override
    public void onDestroy() {
        if (localApiServer != null) localApiServer.stop();
        super.onDestroy();
    }
}