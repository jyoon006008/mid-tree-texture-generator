# MID Tree Texture Generator

사용자가 원하는 나무를 말하거나 입력하면 OpenAI API로 요청을 정리하고, 나무 줄기 텍스처와 나뭇잎 텍스처를 생성해서 `C:\Users\junwo\Desktop\tree_type\generated` 아래 최신 폴더에 저장합니다.

성장 애니메이션 파일은 `generated` 폴더에 복제하지 않습니다. Houdini에서 뽑은 공통 성장 애니메이션은 `C:\Users\junwo\Desktop\tree_type` 아래 별도 위치에 두고, Unity는 최신 `generated` 폴더의 텍스처만 읽어 입히는 구조입니다.

## 실행

1. `.env.example`을 `.env`로 복사합니다.
2. `.env`의 `OPENAI_API_KEY`에 OpenAI API 키를 넣습니다.
3. 실행합니다.

```powershell
npm.cmd start
```

브라우저에서 `http://localhost:5177`을 엽니다.

## 저장 구조

```text
C:\Users\junwo\Desktop\tree_type
├─ animation
│  └─ tree_growth.fbx
└─ generated
   └─ 2026-06-06_103015_cherry-tree
      ├─ bark_texture.png
      ├─ leaf_texture.png
      └─ metadata.json
```

## Unity

`unity/LatestGeneratedTreeTextureLoader.cs`를 Unity 프로젝트에 넣고, 성장 애니메이션이 붙은 나무 오브젝트의 bark renderer와 leaf renderer를 인스펙터에 연결합니다.

HDRP Lit 머티리얼이면 기본 텍스처 프로퍼티는 `_BaseColorMap`을 사용합니다. 다른 셰이더를 쓰면 `textureProperty`를 해당 셰이더의 텍스처 프로퍼티 이름으로 바꾸면 됩니다.

## GitHub 업로드

이 폴더는 Git 저장소로 바로 올릴 수 있습니다.

```powershell
git init
git add .
git commit -m "Add MID tree texture generator"
```

GitHub CLI가 설치되어 있고 로그인되어 있다면:

```powershell
gh repo create mid-tree-texture-generator --private --source . --remote origin --push
```

`gh`가 없으면 GitHub 웹에서 새 리포지토리를 만든 뒤 표시되는 `git remote add origin ...`과 `git push -u origin main` 명령을 실행하면 됩니다.
