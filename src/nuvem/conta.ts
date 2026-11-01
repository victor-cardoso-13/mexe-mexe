/**
 * Conta e nuvem (Firebase). Este arquivo só é carregado depois que o jogo abre,
 * para o jogo abrir rápido e funcionar mesmo sem internet.
 *
 * Onde fica o progresso: jogadores/{uid}/jogos/mexe-mexe
 */
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail,
  signInAnonymously, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { firebaseConfig } from './config';
import type { DadosNuvem } from './mesclar';

const JOGO = 'mexe-mexe';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'pt'; // e-mail de "esqueci a senha" em português
export const banco = getFirestore(app);

// Só para testar no computador, sem mexer no banco de verdade: abrir o jogo com "?emu" (precisa do emulador ligado).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('emu')) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(banco, '127.0.0.1', 8080);
}

export interface Usuario {
  uid: string;
  email: string;
}

/** Avisa quando alguém entra ou sai (e logo ao abrir, com quem já estava dentro). */
export function observarConta(fn: (u: Usuario | null) => void) {
  // O login "invisível" do jogo online (anônimo) não conta como conta: o progresso continua sem conta.
  return onAuthStateChanged(auth, u => fn(u && !u.isAnonymous ? { uid: u.uid, email: u.email ?? '' } : null));
}

/** Quem está na sala online: a conta, se a pessoa entrou; senão um login invisível, sem e-mail nem senha. */
export async function garantirUid(): Promise<string> {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser!.uid;
}

export async function entrar(email: string, senha: string) {
  await signInWithEmailAndPassword(auth, email.trim(), senha);
}

export async function criarConta(email: string, senha: string) {
  await createUserWithEmailAndPassword(auth, email.trim(), senha);
}

export async function sair() {
  await signOut(auth);
}

export async function esqueciSenha(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

const lugar = (uid: string) => doc(banco, 'jogadores', uid, 'jogos', JOGO);

export async function baixar(uid: string): Promise<DadosNuvem | null> {
  const d = await getDoc(lugar(uid));
  return d.exists() ? (d.data() as DadosNuvem) : null;
}

export async function enviar(uid: string, dados: DadosNuvem) {
  await setDoc(lugar(uid), dados);
}

/** Mensagens do Firebase em português simples. */
export function mensagemDeErro(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? '';
  const mensagens: Record<string, string> = {
    'auth/invalid-email': 'Esse e-mail não parece certo. Confira se digitou direitinho.',
    'auth/missing-email': 'Digite o seu e-mail.',
    'auth/missing-password': 'Digite a senha.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 letras ou números.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Toque em "Entrar".',
    // Por segurança, o Firebase não diz se o erro foi no e-mail ou na senha.
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem internet agora. Tente de novo quando a internet voltar.',
  };
  return mensagens[codigo] ?? 'Algo deu errado. Tente de novo daqui a pouco.';
}
