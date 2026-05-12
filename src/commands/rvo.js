import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// ── Extraer contenido view-once del mensaje citado ────────────────────────────
function extractViewOnce(quotedMessage) {
    if (!quotedMessage) return null;

    // Estructura 1: viewOnceMessage (estándar)
    const v1 = quotedMessage.viewOnceMessage?.message;
    if (v1) {
        if (v1.imageMessage) return { data: v1.imageMessage, type: 'image' };
        if (v1.videoMessage) return { data: v1.videoMessage, type: 'video' };
        if (v1.audioMessage) return { data: v1.audioMessage, type: 'audio' };
    }

    // Estructura 2: viewOnceMessageV2
    const v2 = quotedMessage.viewOnceMessageV2?.message;
    if (v2) {
        if (v2.imageMessage) return { data: v2.imageMessage, type: 'image' };
        if (v2.videoMessage) return { data: v2.videoMessage, type: 'video' };
        if (v2.audioMessage) return { data: v2.audioMessage, type: 'audio' };
    }

    // Estructura 3: viewOnceMessageV2Extension
    const v3 = quotedMessage.viewOnceMessageV2Extension?.message;
    if (v3) {
        if (v3.imageMessage) return { data: v3.imageMessage, type: 'image' };
        if (v3.videoMessage) return { data: v3.videoMessage, type: 'video' };
    }

    // Estructura 4: imageMessage/videoMessage con flag viewOnce directo
    if (quotedMessage.imageMessage?.viewOnce) return { data: quotedMessage.imageMessage, type: 'image' };
    if (quotedMessage.videoMessage?.viewOnce) return { data: quotedMessage.videoMessage, type: 'video' };

    return null;
}

// ── Descargar stream de media ──────────────────────────────────────────────────
async function downloadMedia(data, type) {
    const stream = await downloadContentFromMessage(data, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (buf.length < 100) throw new Error('buffer demasiado pequeño');
    return buf;
}

export default [
    {
        name: 'rvo',
        aliases: ['vv', 'revelar', 'viewonce'],
        description: 'Revela una foto o video de vista única. Responde al mensaje con .rvo',
        category: 'utilidades',
        async run({ sock, msg, jid }) {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quotedContent = ctx?.quotedMessage;

            if (!quotedContent) {
                return sock.sendMessage(jid, {
                    text: '❌ Responde al mensaje de *vista única* que quieres revelar con *.rvo*'
                }, { quoted: msg });
            }

            const extracted = extractViewOnce(quotedContent);

            if (!extracted) {
                return sock.sendMessage(jid, {
                    text:
                        '❌ Ese mensaje no es de *vista única* o ya expiró.\n\n' +
                        '_Los mensajes de vista única solo se pueden revelar antes de que sean abiertos._'
                }, { quoted: msg });
            }

            const { data, type } = extracted;

            try {
                process.stdout.write(`  [rvo] descargando ${type}...\n`);
                const buf = await downloadMedia(data, type);
                process.stdout.write(`  [rvo] ✓ ${(buf.length / 1024).toFixed(1)} KB\n`);

                if (type === 'image') {
                    await sock.sendMessage(jid, {
                        image: buf,
                        caption: '🔓 *Vista única revelada*',
                        mimetype: data.mimetype || 'image/jpeg'
                    }, { quoted: msg });

                } else if (type === 'video') {
                    await sock.sendMessage(jid, {
                        video: buf,
                        caption: '🔓 *Vista única revelada*',
                        mimetype: data.mimetype || 'video/mp4'
                    }, { quoted: msg });

                } else if (type === 'audio') {
                    await sock.sendMessage(jid, {
                        audio: buf,
                        mimetype: data.mimetype || 'audio/ogg; codecs=opus',
                        ptt: data.ptt || true
                    }, { quoted: msg });
                }

            } catch (e) {
                process.stdout.write(`  [rvo] ✗ ${e.message}\n`);
                await sock.sendMessage(jid, {
                    text:
                        '❌ No se pudo descargar el contenido.\n\n' +
                        '_Esto ocurre cuando el mensaje ya fue abierto o eliminado._'
                }, { quoted: msg });
            }
        }
    }
];
