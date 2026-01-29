import { NextResponse } from "next/server";

const CLIENT_ID = "Ov23li8tweQw6odWQebz";

export async function POST() {
    try {
        const response = await fetch("https://github.com/login/device/code", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                scope: "read:user",
            }),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to initiate device authorization" },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error initiating device flow:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
