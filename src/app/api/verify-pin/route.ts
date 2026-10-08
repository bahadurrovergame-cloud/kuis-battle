import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin, role } = await request.json();

    const adminPin = process.env.ADMIN_SECRET_PIN || '123456';
    const operatorPin = process.env.OPERATOR_SECRET_PIN || '8888';

    if (role === 'admin' && pin === adminPin) {
      return NextResponse.json({ success: true, role: 'admin' });
    }

    if (role === 'operator' && (pin === operatorPin || pin === adminPin)) {
      return NextResponse.json({ success: true, role: 'operator' });
    }

    return NextResponse.json({ success: false, message: 'PIN Salah!' }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, message: 'Format request salah' }, { status: 400 });
  }
}
