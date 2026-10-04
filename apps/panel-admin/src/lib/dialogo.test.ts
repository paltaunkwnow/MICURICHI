import { describe, expect, it, type Mock, vi } from 'vitest';
import { accionDeTeclado, type ConFoco, entrarAlDialogo } from './dialogo';

const tecla = (key: string, shiftKey = false) => ({ key, shiftKey });

describe('teclado de un diálogo modal (WAI-ARIA, «Dialog (Modal)»)', () => {
  it('Escape lo cierra, esté el foco donde esté', () => {
    for (const actual of [-1, 0, 1, 3]) {
      expect(accionDeTeclado(tecla('Escape'), actual, 4)).toEqual({ tipo: 'cerrar' });
    }
    // También sin nada enfocable adentro y con Mayús apretada.
    expect(accionDeTeclado(tecla('Escape'), -1, 0)).toEqual({ tipo: 'cerrar' });
    expect(accionDeTeclado(tecla('Escape', true), 2, 4)).toEqual({ tipo: 'cerrar' });
  });

  describe('Tab', () => {
    it('desde el último control vuelve al primero', () => {
      expect(accionDeTeclado(tecla('Tab'), 3, 4)).toEqual({ tipo: 'enfocar', indice: 0 });
    });

    it('en el medio no hace nada: el navegador lo mueve solo, y adentro', () => {
      expect(accionDeTeclado(tecla('Tab'), 0, 4)).toEqual({ tipo: 'ninguna' });
      expect(accionDeTeclado(tecla('Tab'), 1, 4)).toEqual({ tipo: 'ninguna' });
      expect(accionDeTeclado(tecla('Tab'), 2, 4)).toEqual({ tipo: 'ninguna' });
    });

    it('con el foco en el propio diálogo (o afuera) lo lleva al primer control', () => {
      expect(accionDeTeclado(tecla('Tab'), -1, 4)).toEqual({ tipo: 'enfocar', indice: 0 });
    });
  });

  describe('Mayús+Tab', () => {
    it('desde el primer control salta al último', () => {
      expect(accionDeTeclado(tecla('Tab', true), 0, 4)).toEqual({ tipo: 'enfocar', indice: 3 });
    });

    it('en el medio y en el último no hace nada', () => {
      expect(accionDeTeclado(tecla('Tab', true), 1, 4)).toEqual({ tipo: 'ninguna' });
      expect(accionDeTeclado(tecla('Tab', true), 3, 4)).toEqual({ tipo: 'ninguna' });
    });

    it('con el foco en el propio diálogo (o afuera) lo lleva al último control', () => {
      expect(accionDeTeclado(tecla('Tab', true), -1, 4)).toEqual({ tipo: 'enfocar', indice: 3 });
    });
  });

  it('con un solo control, el foco no sale de él en ningún sentido', () => {
    expect(accionDeTeclado(tecla('Tab'), 0, 1)).toEqual({ tipo: 'enfocar', indice: 0 });
    expect(accionDeTeclado(tecla('Tab', true), 0, 1)).toEqual({ tipo: 'enfocar', indice: 0 });
  });

  it('sin ningún control adentro, Tab y Mayús+Tab retienen el foco en el diálogo', () => {
    expect(accionDeTeclado(tecla('Tab'), -1, 0)).toEqual({ tipo: 'retener' });
    expect(accionDeTeclado(tecla('Tab', true), -1, 0)).toEqual({ tipo: 'retener' });
  });

  it('cualquier otra tecla es del control que la recibe: ni cierra ni mueve el foco', () => {
    for (const key of ['Enter', ' ', 'a', 'ArrowDown', 'Home', 'Backspace', 'F5']) {
      expect(accionDeTeclado(tecla(key), 1, 4), key).toEqual({ tipo: 'ninguna' });
    }
  });
});

/** Un elemento de mentira: el entorno de las pruebas no tiene DOM, solo importa quién recibe el foco. */
function conFoco(): { focus: Mock<() => void> } {
  return { focus: vi.fn<() => void>() };
}

describe('foco al abrir y al cerrar un diálogo', () => {
  it('al abrir, el foco entra al diálogo', () => {
    const dialogo = conFoco();
    const boton = conFoco();
    entrarAlDialogo(dialogo, () => boton);
    expect(dialogo.focus).toHaveBeenCalledTimes(1);
    // Todavía no se cerró: el botón que lo abrió no recibe nada.
    expect(boton.focus).not.toHaveBeenCalled();
  });

  it('al cerrar, el foco vuelve a quien lo abrió', () => {
    const dialogo = conFoco();
    const boton = conFoco();
    const cerrar = entrarAlDialogo(dialogo, () => boton);
    cerrar();
    expect(boton.focus).toHaveBeenCalledTimes(1);
    // Y el diálogo no vuelve a tomar el foco.
    expect(dialogo.focus).toHaveBeenCalledTimes(1);
  });

  it('el destino se mira al cerrar, no al abrir: si el botón se volvió a dibujar, va al nuevo', () => {
    const viejo = conFoco();
    const nuevo = conFoco();
    let actual: ConFoco = viejo;
    const cerrar = entrarAlDialogo(conFoco(), () => actual);
    actual = nuevo;
    cerrar();
    expect(viejo.focus).not.toHaveBeenCalled();
    expect(nuevo.focus).toHaveBeenCalledTimes(1);
  });

  it('si no hay a quién devolver el foco (o el diálogo no existe), no falla', () => {
    expect(() => entrarAlDialogo(null, () => null)()).not.toThrow();
    const dialogo = conFoco();
    expect(() => entrarAlDialogo(dialogo, () => null)()).not.toThrow();
    expect(dialogo.focus).toHaveBeenCalledTimes(1);
  });
});
