using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;

public sealed class LatestGeneratedTreeTextureLoader : MonoBehaviour
{
    [Header("Texture Folder")]
    [SerializeField] private string treeTypeRoot = @"C:\Users\junwo\Desktop\tree_type";
    [SerializeField] private string generatedFolderName = "generated";

    [Header("Target Renderers")]
    [SerializeField] private Renderer barkRenderer;
    [SerializeField] private Renderer leafRenderer;
    [SerializeField] private string textureProperty = "_BaseColorMap";

    private IEnumerator Start()
    {
        var latestFolder = GetLatestGeneratedFolder();
        if (string.IsNullOrEmpty(latestFolder))
        {
            Debug.LogWarning($"No generated texture folder found under {Path.Combine(treeTypeRoot, generatedFolderName)}");
            yield break;
        }

        yield return ApplyTexture(Path.Combine(latestFolder, "bark_texture.png"), barkRenderer);
        yield return ApplyTexture(Path.Combine(latestFolder, "leaf_texture.png"), leafRenderer);
        Debug.Log($"Applied latest generated tree textures: {latestFolder}");
    }

    private string GetLatestGeneratedFolder()
    {
        var generatedRoot = Path.Combine(treeTypeRoot, generatedFolderName);
        if (!Directory.Exists(generatedRoot)) return null;

        return Directory.GetDirectories(generatedRoot)
            .Select(path => new DirectoryInfo(path))
            .OrderByDescending(info => info.CreationTimeUtc)
            .ThenByDescending(info => info.LastWriteTimeUtc)
            .Select(info => info.FullName)
            .FirstOrDefault();
    }

    private IEnumerator ApplyTexture(string filePath, Renderer targetRenderer)
    {
        if (targetRenderer == null || !File.Exists(filePath)) yield break;

        using var request = UnityWebRequestTexture.GetTexture(new Uri(filePath).AbsoluteUri);
        yield return request.SendWebRequest();

        if (request.result != UnityWebRequest.Result.Success)
        {
            Debug.LogWarning($"Texture load failed: {filePath} / {request.error}");
            yield break;
        }

        var texture = DownloadHandlerTexture.GetContent(request);
        var material = targetRenderer.material;
        if (material.HasProperty(textureProperty)) material.SetTexture(textureProperty, texture);
        else material.mainTexture = texture;
    }
}
