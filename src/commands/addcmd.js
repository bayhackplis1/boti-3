import { get, set, remove, getAll, getStickerHash, count } from '../lib/stickerDB.js';

export default [
    {
        name: 'addcmd',
        aliases: ['agregarcmd'],
        description: 'Registra un sticker: cuando alguien lo envíe, el bot responde con el texto dado',
        category: 'admin',
        async run({ sock, msg, jid, args, prefix }) {
            if (!args.length) {
                return sock.sendMessage(jid, {
                    text:
                        `❌ Falta el texto de respuesta.\n\n` +
                        `*Uso:* ${prefix}addcmd <texto que quieres que responda>\n` +
                        `_(respondiendo a un sticker)_`
                }, { quoted: msg });
            }

            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quotedSticker = ctx?.quotedMessage?.stickerMessage;

            if (!quotedSticker) {
                return sock.sendMessage(jid, {
                    text:
                        `❌ Tienes que *responder a un sticker* con este comando.\n\n` +
                        `*Ej:* Responde un sticker con ${prefix}addcmd hola cómo estás`
                }, { quoted: msg });
            }

            const hash = getStickerHash(quotedSticker);
            if (!hash) {
                return sock.sendMessage(jid, { text: '❌ No pude leer el hash del sticker.' }, { quoted: msg });
            }

            const texto = args.join(' ');
            const existing = get(hash);

            set(hash, {
                text: texto,
                addedBy: msg.key.participant || msg.key.remoteJid,
                addedAt: Date.now()
            });

            const accion = existing ? '✏️ *Texto actualizado*' : '✅ *Sticker registrado*';
            await sock.sendMessage(jid, {
                text:
                    `${accion}\n\n` +
                    `Cuando alguien envíe ese sticker, responderé con:\n` +
                    `❝ _${texto}_ ❞`
            }, { quoted: msg });
        }
    },

    {
        name: 'delcmd',
        aliases: ['eliminarcmd', 'removecmd'],
        description: 'Elimina el trigger de un sticker registrado. Responde al sticker con .delcmd',
        category: 'admin',
        async run({ sock, msg, jid, prefix }) {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quotedSticker = ctx?.quotedMessage?.stickerMessage;

            if (!quotedSticker) {
                return sock.sendMessage(jid, {
                    text:
                        `❌ Responde al *sticker* que quieres eliminar con ${prefix}delcmd\n` +
                        `_(sin texto extra)_`
                }, { quoted: msg });
            }

            const hash = getStickerHash(quotedSticker);
            if (!hash) {
                return sock.sendMessage(jid, { text: '❌ No pude leer el hash del sticker.' }, { quoted: msg });
            }

            const entry = get(hash);
            if (!entry) {
                return sock.sendMessage(jid, {
                    text: '⚠️ Ese sticker no tiene ningún trigger registrado.'
                }, { quoted: msg });
            }

            remove(hash);
            await sock.sendMessage(jid, {
                text: `🗑️ *Trigger eliminado*\n\nEra: ❝ _${entry.text}_ ❞`
            }, { quoted: msg });
        }
    },

    {
        name: 'listcmd',
        aliases: ['miscmds', 'cmdlist', 'stickers'],
        description: 'Muestra todos los sticker triggers guardados',
        category: 'admin',
        async run({ sock, msg, jid, prefix }) {
            const db = getAll();
            const entradas = Object.values(db);

            if (entradas.length === 0) {
                return sock.sendMessage(jid, {
                    text:
                        `📭 *No hay stickers registrados.*\n\n` +
                        `Responde a un sticker con:\n${prefix}addcmd <texto de respuesta>`
                }, { quoted: msg });
            }

            const lista = entradas
                .map((e, i) => `*${i + 1}.* ❝ ${e.text} ❞`)
                .join('\n');

            await sock.sendMessage(jid, {
                text:
                    `🎭 *Sticker triggers (${entradas.length}):*\n\n` +
                    `${lista}\n\n` +
                    `_Responde al sticker con ${prefix}delcmd para eliminar uno._`
            }, { quoted: msg });
        }
    }
];
