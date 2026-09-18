#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ======================================
// WIFI
// ======================================

const char *ssid = "Stasiun gubeng";
const char *password = "iyopaling";

// ======================================
// SERVER
// ======================================

WebServer server(80);

WebSocketsServer webSocket = WebSocketsServer(81);

// ======================================
// DATA KWH METER
// ======================================

float voltage = 229.7;
float current = 2.35;
float powerFactor = 0.94;
float activePower = 0.0;
float energy = 0.0;

// Waktu pengiriman data
unsigned long lastSend = 0;

// ======================================
// WEBSOCKET EVENT
// ======================================

void webSocketEvent(
    uint8_t clientNum,
    WStype_t type,
    uint8_t *payload,
    size_t length)
{

    switch (type)
    {

    case WStype_CONNECTED:

        Serial.print("Client terhubung: ");
        Serial.println(clientNum);

        break;

    case WStype_DISCONNECTED:

        Serial.print("Client terputus: ");
        Serial.println(clientNum);

        break;

    case WStype_TEXT:

        Serial.print("Pesan dari browser: ");
        Serial.println((char *)payload);

        break;
    }
}

// ======================================
// KIRIM DATA KE BROWSER
// ======================================

void sendData()
{

    // ----------------------------------
    // CONTOH DATA
    // ----------------------------------
    // Nanti bagian ini diganti dengan
    // pembacaan sensor sebenarnya.

    voltage = 229.0 + random(-10, 11) / 10.0;

    current = 2.30 + random(-20, 21) / 100.0;

    powerFactor = 0.90 + random(0, 10) / 100.0;

    // Rumus daya aktif
    activePower =
        voltage *
        current *
        powerFactor;

    // ----------------------------------
    // HITUNG ENERGI
    // ----------------------------------

    /*
       P(W) × waktu(jam) = Wh

       Karena data dikirim setiap 1 detik:

       waktu = 1 / 3600 jam
    */

    energy +=
        activePower / 3600.0 / 1000.0;

    // ----------------------------------
    // BUAT JSON
    // ----------------------------------

    JsonDocument doc;

    doc["voltage"] = voltage;
    doc["current"] = current;
    doc["powerFactor"] = powerFactor;
    doc["activePower"] = activePower;
    doc["energy"] = energy;

    String json;

    serializeJson(doc, json);

    // ----------------------------------
    // KIRIM KE SEMUA CLIENT
    // ----------------------------------

    webSocket.broadcastTXT(json);

    Serial.println(json);
}

// ======================================
// SETUP
// ======================================

void setup()
{

    Serial.begin(115200);

    // ==================================
    // WIFI
    // ==================================

    WiFi.begin(ssid, password);

    Serial.print("Menghubungkan WiFi");

    while (WiFi.status() != WL_CONNECTED)
    {

        delay(500);

        Serial.print(".");
    }

    Serial.println();

    Serial.println("WiFi terhubung!");

    Serial.print("IP ESP32: ");

    Serial.println(WiFi.localIP());
    delay(1000);

    // ==================================
    // LITTLEFS
    // ==================================

    if (!LittleFS.begin(true))
    {

        Serial.println("LittleFS gagal!");

        return;
    }

    Serial.println("LittleFS berhasil");

    // ==================================
    // WEB SERVER
    // ==================================

    server.on("/", HTTP_GET, []()
              {

        File file = LittleFS.open("/index.html", "r");

        if (!file) {

            server.send(
                404,
                "text/plain",
                "index.html tidak ditemukan"
            );

            return;
        }


        server.streamFile(
            file,
            "text/html"
        );


        file.close(); });

    // Melayani CSS dan JavaScript
    server.serveStatic(
        "/",
        LittleFS,
        "/");

    server.begin();

    // ==================================
    // WEBSOCKET
    // ==================================

    webSocket.begin();

    webSocket.onEvent(webSocketEvent);

    Serial.println("Web Server aktif");

    Serial.println("WebSocket aktif pada port 81");
}

// ======================================
// LOOP
// ======================================

void loop()
{

    server.handleClient();

    webSocket.loop();

    // Kirim data setiap 1 detik
    if (millis() - lastSend >= 1000)
    {

        lastSend = millis();

        sendData();
    }
}