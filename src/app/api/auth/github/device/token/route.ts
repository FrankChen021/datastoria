import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = "Ov23li8tweQw6odWQebz";

export async function POST(req: NextRequest) {
    try {
        const { device_code } = await req.json();

        if (!device_code) {
            return NextResponse.json(
                { error: "device_code is required" },
                { status: 400 }
            );
        }

        const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                device_code,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to fetch access token" },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error polling for token:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
