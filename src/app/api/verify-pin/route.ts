import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin, role } = await request.json();

    const envAdminPin = process.env.ADMIN_SECRET_PIN;
    const envOperatorPin = process.env.OPERATOR_SECRET_PIN;

    // PIN Admin: default 123456 atau dari environment variable
    const validAdminPins = [envAdminPin, '123456'].filter(Boolean);

    // PIN Operator: default 8888, 654321, atau admin PIN
    const validOperatorPins = [
      envOperatorPin,
      '8888',
      '654321',
      ...validAdminPins,
    ].filter(Boolean);

    if (role === 'admin' && validAdminPins.includes(String(pin).trim())) {
      return NextResponse.json({ success: true, role: 'admin' });
    }

    if (role === 'operator' && validOperatorPins.includes(String(pin).trim())) {
      return NextResponse.json({ success: true, role: 'operator' });
    }

    return NextResponse.json(
      { success: false, message: 'PIN yang Anda masukkan tidak valid!' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Format request salah' },
      { status: 400 }
    );
  }
}
