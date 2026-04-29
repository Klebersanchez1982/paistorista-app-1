# Checklist Rapido - Teste Local (Windows)

Use este roteiro curto para validar o sistema em poucos minutos.

## 1) Subir servidor local

No terminal, na pasta do projeto:

```powershell
cd "c:\Projetos\paistorista-app-1-main - Copia"
```

Opcao A (Python):

```powershell
python -m http.server 8000
```

Opcao B (Node):

```powershell
npx http-server . -p 8000
```

Abrir no navegador:

- http://localhost:8000

## 2) Validar pre-condicoes

- Firebase: `localhost` e `127.0.0.1` em Authorized domains.
- Maps: usar host `localhost` ou `127.0.0.1`.
- Internet ativa.

## 3) Smoke test funcional

1. Abrir `http://localhost:8000`.
2. Confirmar redirecionamento para login quando deslogado.
3. Login Google como motorista.
4. Em app do motorista:
   - preencher escola, vagas, origem, destino e horario
   - clicar em Tracar rota
   - salvar carona
5. Logout.
6. Login Google como passageiro.
7. Em app do passageiro:
   - selecionar escola
   - visualizar caronas
   - solicitar carona
8. Confirmar rodape com versao `v2.0.1` nas paginas.

## 4) Erros comuns e acao rapida

- ERR_CONNECTION_REFUSED:
  - servidor nao iniciou; rode um comando da secao 1

- Mapa nao carrega:
  - URL fora de localhost/127.0.0.1
  - chave/restricao da API Maps invalida

- Login Google falha:
  - dominio nao autorizado no Firebase

- Erro ao salvar carona com "Missing or insufficient permissions":
  - publicar as regras do arquivo `firestore.rules` no Firestore Rules do Firebase Console

## 5) Encerrar teste

No terminal do servidor:

```powershell
Ctrl + C
```

---

Guia completo: ver TESTE_LOCAL.md
