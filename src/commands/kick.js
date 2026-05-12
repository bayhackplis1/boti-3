// ── Extraer número puro de cualquier JID ─────────────────────────────────────
function num(jid = '') {
    return (jid || '').split('@')[0].split(':')[0].trim();
}

// ── Verificar si un participante es admin ─────────────────────────────────────
function esAdmin(p) {
    return p?.admin === 'admin' || p?.admin === 'superadmin';
}

// ── Buscar participante por número o LID ─────────────────────────────────────
function buscarParticipante(participants, jid) {
    const n = num(jid);
    return participants.find(p => num(p.jid) === n || num(p.lid || '') === n);
}

// ── Obtener JID objetivo desde el mensaje citado o mención ────────────────────
function getTarget(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!ctx) return null;

    // Prioridad 1: mención con @
    if (ctx.mentionedJid?.length) return ctx.mentionedJid[0];

    // Prioridad 2: mensaje citado (reply)
    if (ctx.participant) return ctx.participant;

    return null;
}

export default [
    {
        name: 'kick',
        aliases: ['expulsar', 'echar', 'sacar', 'eliminar'],
        description: 'Expulsa a un miembro del grupo respondiendo a su mensaje o mencionándolo',
        category: 'grupos',
        groupOnly: true,
        async run({ sock, msg, jid, args, sender, prefix }) {

            // ── 1. Obtener metadata del grupo ─────────────────────────────────
            let meta;
            try {
                meta = await sock.groupMetadata(jid);
            } catch (e) {
                return sock.sendMessage(jid, { text: `❌ No pude obtener info del grupo: ${e.message}` }, { quoted: msg });
            }

            const { participants } = meta;

            // ── DEBUG: imprimir JIDs para diagnóstico ─────────────────────────
            const botNum  = num(sock.user?.id);
            const senderNum = num(sender || msg.key.participant || msg.key.remoteJid);
            process.stdout.write(`  [kick] bot=${botNum} sender=${senderNum}\n`);
            process.stdout.write(`  [kick] participantes: ${participants.map(p => `${num(p.jid)}(${p.admin||'none'})`).join(', ')}\n`);

            // ── 2. Verificar que el bot es admin ──────────────────────────────
            const botParticipant = buscarParticipante(participants, sock.user?.id);
            if (!botParticipant || !esAdmin(botParticipant)) {
                return sock.sendMessage(jid, {
                    text: '❌ Necesito ser *administrador* del grupo para poder expulsar.'
                }, { quoted: msg });
            }

            // ── 3. Verificar que el sender es admin ───────────────────────────
            const senderRaw = sender || msg.key.participant || msg.key.remoteJid;
            const senderParticipant = buscarParticipante(participants, senderRaw);
            if (!senderParticipant || !esAdmin(senderParticipant)) {
                return sock.sendMessage(jid, {
                    text: '❌ Solo los *administradores* pueden usar este comando.'
                }, { quoted: msg });
            }

            // ── 4. Obtener objetivo ───────────────────────────────────────────
            const targetRaw = getTarget(msg);
            if (!targetRaw) {
                return sock.sendMessage(jid, {
                    text:
                        `❌ No encontré a quién expulsar.\n\n` +
                        `▸ Responde al mensaje del miembro con *${prefix}kick*\n` +
                        `▸ O usa *${prefix}kick @miembro*`
                }, { quoted: msg });
            }

            // Normalizar: si es @lid intentar resolverlo al JID real
            let targetJid = targetRaw;
            if (targetRaw.endsWith('@lid')) {
                const encontrado = participants.find(p => {
                    const lid = p.lid || p.jid;
                    return num(lid) === num(targetRaw);
                });
                if (encontrado) targetJid = encontrado.jid;
            }

            process.stdout.write(`  [kick] target=${targetJid}\n`);

            // ── 5. No expulsarse a sí mismo ───────────────────────────────────
            if (num(targetJid) === botNum) {
                return sock.sendMessage(jid, { text: '😅 No me puedo expulsar a mí mismo.' }, { quoted: msg });
            }

            // ── 6. No expulsar a otro admin ───────────────────────────────────
            const targetParticipant = buscarParticipante(participants, targetJid);
            if (targetParticipant && esAdmin(targetParticipant)) {
                return sock.sendMessage(jid, {
                    text: '❌ No puedo expulsar a otro *administrador*.'
                }, { quoted: msg });
            }

            const targetNum = num(targetJid);
            const razon = args.join(' ').replace(/@\d+/g, '').trim();

            // ── 7. Mensaje de motivo (opcional) ───────────────────────────────
            if (razon) {
                const adminNum = num(senderRaw);
                await sock.sendMessage(jid, {
                    text:
                        `╭─⬣「 🚫 *EXPULSIÓN* 」⬣\n` +
                        `│\n` +
                        `├❯ *Usuario:* @${targetNum}\n` +
                        `├❯ *Motivo:* ${razon}\n` +
                        `├❯ *Admin:* @${adminNum}\n` +
                        `│\n` +
                        `╰─⬣ *¡Hasta luego!* ⬣`,
                    mentions: [targetJid, senderRaw]
                });
                await new Promise(r => setTimeout(r, 1000));
            }

            // ── 8. Expulsar ───────────────────────────────────────────────────
            try {
                const res = await sock.groupParticipantsUpdate(jid, [targetJid], 'remove');
                const status = res?.[0]?.status?.toString();
                process.stdout.write(`  [kick] status=${status}\n`);

                if (status === '200') {
                    await sock.sendMessage(jid, {
                        text: `✅ @${targetNum} fue expulsado del grupo.`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else if (status === '406') {
                    await sock.sendMessage(jid, {
                        text: `⚠️ No se pudo expulsar a @${targetNum} — puede que ya no esté o sea admin.`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else if (status === '404') {
                    await sock.sendMessage(jid, {
                        text: `⚠️ @${targetNum} ya no está en el grupo.`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, {
                        text: `⚠️ Respuesta inesperada (${status}). Puede que no tenga permisos suficientes.`
                    }, { quoted: msg });
                }
            } catch (e) {
                process.stdout.write(`  [kick] error: ${e.message}\n`);
                await sock.sendMessage(jid, { text: `❌ Error al expulsar: _${e.message}_` }, { quoted: msg });
            }
        }
    }
];
