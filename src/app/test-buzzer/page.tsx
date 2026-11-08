"use client"; // Wajib kalau pakai Next.js App Router biar bisa pakai useEffect

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// WAJIB pakai URL dan Key "Hub" yang SAMA PERSIS dengan yang di HP tadi
const urlHub = 'https://walaesizlxguuhatsrsc.supabase.co';
const keyHub = 'sb_publishable_fZzmosUtWojQp0caBHiuYQ_YCaPNT4U';
const supabase = createClient(urlHub, keyHub);

export default function LayarProyektor() {
  const [penjawab, setPenjawab] = useState<string | null>(null);

  useEffect(() => {
    // Proyektor "nguping" di channel yang sama: 'quiz-battle'
    const channel = supabase.channel('quiz-battle')
      .on(
        'broadcast', 
        { event: 'buzzer-pressed' }, // Nangkap event yang namanya sama persis dari HP
        (payload) => {
          console.log('Sinyal masuk dari HP:', payload);
          // Ambil nama pemain dari data yang dikirim HP
          setPenjawab(payload.payload.player);
          
          // Nanti di sini bisa ditambahin logic untuk mainin suara bel di laptop
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div style={{ 
      height: '100vh', 
      backgroundColor: '#111', 
      color: 'white', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '20px' }}>Layar Utama Kuis</h1>
      
      {penjawab ? (
        <div style={{ textAlign: 'center', backgroundColor: 'red', padding: '50px', borderRadius: '20px' }}>
          <h2 style={{ fontSize: '2rem', margin: 0 }}>Yang pencet duluan:</h2>
          <h1 style={{ fontSize: '6rem', margin: '10px 0', textTransform: 'uppercase' }}>
            {penjawab}
          </h1>
          <button 
            onClick={() => setPenjawab(null)}
            style={{ padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer', marginTop: '20px' }}
          >
            Reset Buzzer
          </button>
        </div>
      ) : (
        <h2 style={{ fontSize: '2rem', color: '#666' }}>Menunggu pemain menekan tombol...</h2>
      )}
    </div>
  );
}