package org.entermediadb.mediaboat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import org.apache.http.HttpResponse;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.util.EntityUtils;
import org.entermediadb.net.HttpSharedConnection;
import org.entermediadb.utils.HttpMimeBuilder;
import org.entermediadb.utils.OutputFiller;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

public class EnterMediaModel
{
	WsConnection connection;
	HttpSharedConnection httpconnection;
	OutputFiller fieldFiller;
	LogListener fieldLogListener;
	public LogListener getLogListener()
	{
		return fieldLogListener;
	}

	public void setLogListener(LogListener inLogListener)
	{
		fieldLogListener = inLogListener;
	}

	public OutputFiller getFiller()
	{
		if (fieldFiller == null)
		{
			fieldFiller = new OutputFiller();
		}
		return fieldFiller;
	}

	public void setFiller(OutputFiller inFiller)
	{
		fieldFiller = inFiller;
	}

	public HttpSharedConnection getHttpConnection()
	{
		if (httpconnection == null)
		{
			httpconnection = new HttpSharedConnection();
		}

		return httpconnection;
	}

	Configuration config ;

	public Configuration getConfig()
	{
		if (config == null)
		{
			config = new Configuration(findHome());
		}

		return config;
	}

	public WsConnection getConnection()
	{
		return connection;
	}
	public void setConnection(WsConnection inConnection)
	{
		connection = inConnection;
	}
	//This class will be notified when they should move files around?

	protected String getServer()
	{
		return getConfig().get("server");
	}

	protected String getUserId()
	{
		return getConfig().get("username");
	}
	
	public String getWorkFolder()
	{
		String path = getConfig().get("home");
		return path + "/EnterMedia";
	}
	
	public boolean login(URI uri, String server, String inUname, String inKey)
	{
		String path = getConfig().get("home");
		if (path == null)
		{
			path = findHome();
			getConfig().put("home", path);
		}
		//Check disk space etc?
//		try
//		{
//			
//			log("Connecting to " + uri);
//			
//			boolean ok = getConnection().connect();
//			if (!ok)
//			{
//				log("Could not connect to " + getConnection().getURI());
//				return false;
//			}
//			log("Connected to " + getConnection().getURI());
//		}
//		catch (InterruptedException e)
//		{
//			// TODO Auto-generated catch block
//			e.printStackTrace();
//			log("Error connecting to " + getConnection().getURI());
//			return false;
//		}
		Message mes = new Message("login");
		mes.put("home", path);
		mes.put("username", inUname);
		mes.put("server", server);
		mes.put("entermedia.key", inKey);
		mes.put("desktopid", System.getProperty("os.name") + " " + getComputerName());
		mes.put("homefolder", path);
		
		Collection checkedout = new ArrayList();
		//load up
		File home = new File(getWorkFolder());
		home.mkdirs();
		File[] found = home.listFiles();
		for (int i = 0; i < found.length; i++)
		{
			File item = found[i];
			if( item.isDirectory() )
			{
				checkedout.add(item.getName());
			}
		}
		mes.put("existingcollections", checkedout);
		getConnection().send(mes);
		return true;

	}

	protected String findHome()
	{
		String path;
		path = System.getenv("HOME");
		if( path == null)
		{
			path = System.getenv("HOMEPATH");
		}
		return path;
	}

	protected String getComputerName()
	{
		Map<String, String> env = System.getenv();
		if (env.containsKey("COMPUTERNAME"))
			return env.get("COMPUTERNAME");
		else if (env.containsKey("HOSTNAME"))
			return env.get("HOSTNAME");
		else
		{
			try
			{
				return InetAddress.getLocalHost().getHostName();
			}
			catch (UnknownHostException e)
			{
				return "Unknown";
			}
		}
	}

	private void log(String inString)
	{
		System.out.println(inString);
	}

	public void busy(boolean inBusy)
	{
		Message mes = new Message("busychanged");
		mes.put("isbusy",inBusy);
		getConnection().send(mes);
	}

	public void downloadFolders(Map inReq)
	{
		busy(true);
		try
		{
			String catalogid = (String)inReq.get("catalogid");
			String mediadbid = (String)inReq.get("mediadbid");
			//String collectionid = (String)inReq.get("collectionid");
			String categoryid = (String)inReq.get("categoryid");

			Map folder = (Map)inReq.get("folderdetails"); //This has children
			String rootname = (String)inReq.get("rootname");
			
			JSONObject inParams = new JSONObject();
			inParams.put("catalogid",catalogid);
			inParams.put("mediadbid",mediadbid);
			inParams.put("rootname", rootname);
			//inParams.put("collectionid", collectionid);
			inParams.put("categoryid", categoryid);
			inParams.put("server",getServer());

			downloadFolder(inParams,folder); //Recursive
			
			getLogListener().info(rootname + " download complete");
			Message mess = new Message("folderedited");
			mess.put("foldername", rootname);
			getConnection().send(mess);
			
		}
		finally
		{
			busy(false);
		}
	}
	private void downloadFolder(Map inParams, Map inFolder)
	{
		String mediadbid = (String)inParams.get("mediadbid");

		JSONObject request = new JSONObject(inParams);
		String categoryid = (String)inFolder.get("categoryid");
		request.put("categoryid",categoryid);
		//One folder at a time
		String url = getServer() + "/" + mediadbid + "/services/module/asset/sync/downloadfolder.json";
		try
		{
			String subpath = (String)inFolder.get("subpath");
			debug("downloadFolders on" + subpath + " sent " + request.toJSONString());
			HttpResponse resp = getHttpConnection().sharedPostWithJson(url,request);
	
			if (resp.getStatusLine().getStatusCode() == 200)
			{
				JSONParser parser = new JSONParser();
				String returned = EntityUtils.toString(resp.getEntity());
				debug("download " + subpath + " returned: " + returned);
				JSONObject parsed = (JSONObject)parser.parse(returned);
//				Reader reader = new InputStreamReader(resp.getEntity().getContent(),"UTF-8");
//				JSONObject parsed = (JSONObject)parser.parse(reader);
//				getFiller().close(reader);
				EntityUtils.consume(resp.getEntity());

				Collection children = (Collection)inFolder.get("children");
				Set subfolders = new HashSet();
				for (Iterator iterator = children.iterator(); iterator.hasNext();)
				{
					Map subfolder = (Map) iterator.next();
					subfolders.add(subfolder.get("name"));
				}
				downloadFilesinFolder(inParams,subpath,subfolders,parsed);

				for (Iterator iterator = children.iterator(); iterator.hasNext();)
				{
					Map subfolder = (Map) iterator.next();
					downloadFolder(inParams,subfolder);
				}
			}
			else
			{
				debug("downloadFolder Error on " + subpath  + " code:" + resp.getStatusLine().getStatusCode() );
				getLogListener().info(resp.getStatusLine().getStatusCode() + " Could not upload " + url + " " + resp.getStatusLine().getReasonPhrase());
			}
		}
		catch( Exception ex)
		{
			throw new RuntimeException(ex);
		}
	}

	private void downloadFilesinFolder(Map params, String inPath, Set inSubFolders, JSONObject inParsed)
	{
		//The path is a collection path
		String path = getWorkFolder() + inPath;
		File folder = new File(path);
		folder.mkdirs();
		File[] files = folder.listFiles();
		Map existingfiles = new HashMap();
		
		//TODO: If we are deleting make sure they confirm
		for (int i = 0; i < files.length; i++)
		{
			//Files and folders
			File file = files[i];
			existingfiles.put(file.getName(),file);
		}
		
		Collection sourcepaths = (Collection)inParsed.get("assets");
		
		for (Iterator iterator = sourcepaths.iterator(); iterator.hasNext();)
		{
			Map downloadreq = (Map) iterator.next();
			String savepath = (String) downloadreq.get("savepath");
			File tosave = new File(getWorkFolder() + "/" + savepath);
			existingfiles.remove(tosave.getName());
			String size = (String) downloadreq.get("filesize");

			if( tosave.exists() && tosave.length() == Long.parseLong(size))
			{
				continue;
			}	
			String url = (String) downloadreq.get("url"); //Full URL to content. Might be in other servers
			HttpResponse resp = getHttpConnection().sharedPost(url, params);
			if (resp.getStatusLine().getStatusCode() == 200)
			{
				InputStream input = null;
				FileOutputStream output = null;
				try
				{
					input = resp.getEntity().getContent();
					tosave.getParentFile().mkdirs();
					output = new FileOutputStream(tosave);
					getFiller().fill(input, output);

					String savetime = (String) downloadreq.get("assetmodificationdate");
					tosave.setLastModified(Long.parseLong(savetime));
					
				}
				catch (Throwable ex)
				{
					getLogListener().reportError("Problem downloading", ex);
				}
				finally
				{
					getFiller().consume(resp);
					getFiller().close(input);
					getFiller().close(output);
				}

			}
			else
			{
				getLogListener().info(resp.getStatusLine().getStatusCode() + " Could not download " + url + " " + resp.getStatusLine().getReasonPhrase());
			}
		}
		boolean confirmed = false;
		for (Iterator iterator = existingfiles.keySet().iterator(); iterator.hasNext();)
		{
			if( !confirmed )
			{
				//confirm confirmed = true;
				//break;
			}
			String name = (String ) iterator.next();
			File file = (File)existingfiles.get(name);
			if( file.isDirectory() )
			{
				if( !inSubFolders.contains( file.getName() ) )
				{
					deleteAll(file);
				}
				//be careful
				//check inSubFolders
			}
			else
			{
				file.delete();
			}
			
		}
	}

	public void deleteAll( File file )
	{
		if (file.isDirectory())
		{
			// If it's a dir, then delete everything in it.
			File[] fileList = file.listFiles();

			if (fileList != null)
			{
				for ( int idx = 0; idx < fileList.length; idx++ )
					deleteAll( fileList[idx] );
			}
		}
		// Now delete ourselves, whether a file or a dir.
		file.delete();
	}
	private String getEnterMediaKey()
	{
		return getConfig().get("key");
	}

	public void disconnect()
	{
		getConnection().disconnect();
	}

	public void checkinFiles(Map inMap)
	{
		JSONObject params = new JSONObject(inMap);

		String fileroot = (String) inMap.get("rootfolder");
//		String collectionid = (String) inMap.get("collectionid");
//		String catalogid = (String) inMap.get("catalogid");
//		String catalogid = (String) inMap.get("catalogid");

//		params.put("home", fileroot);
		params.put("entermedia.key", getEnterMediaKey());
		params.put("desktopid", System.getProperty("os.name") + " " + getComputerName());
//		params.put("homefolder", fileroot);
//		params.put("collectionid", collectionid);
//		params.put("catalogid", catalogid);
//		params.put("revision", inMap.get("revision"));

		File collectionfolder = new File(fileroot);

		sendFolder(params, fileroot,"",collectionfolder);

		
	}

	protected void sendFolder(JSONObject inParams, String absrootfolder, String subfolder, File file)
	{
		ArrayList filelist = new ArrayList();
		ArrayList childfolders = new ArrayList();
		ArrayList folderstoprocess = new ArrayList();

		JSONObject root = new JSONObject();
		root.put("foldername", file.getName());
		root.put("parentpath", absrootfolder);
		root.put("subfolder", subfolder);

		root.put("filelist", filelist);
		root.put("childfolders", childfolders);

		File[] files = file.listFiles();

		for (int i = 0; i < files.length; i++)
		{
			File child = files[i];
			if (child.isDirectory())
			{

				JSONObject folderinfo = new JSONObject();
				folderinfo.put("foldername", child.getName());
				childfolders.add(folderinfo);
				folderstoprocess.add(child);
			}
			else
			{
				JSONObject fileinfo = new JSONObject();
				fileinfo.put("filename", child.getName());
				fileinfo.put("fullpath", child.getAbsolutePath());
				fileinfo.put("filesize", child.length());
				fileinfo.put("modificationdate", child.lastModified());
//				String newmd5 = runMd5(child);
//				fileinfo.put("newmd5", newmd5);
				
				filelist.add(fileinfo);
			}
		}
		pushFolder(inParams, root);
		for (Iterator iterator = folderstoprocess.iterator(); iterator.hasNext();)
		{
			File folder = (File) iterator.next();
			String childpath = subfolder + "/" + folder.getName();
			sendFolder(inParams, absrootfolder, childpath, folder);
		}

	}

	protected void pushFolder(JSONObject inParams, JSONObject inRoot)
	{
		//TODO: Call some post command and POST a folder full of content

		//POST https://www.googleapis.com/upload/storage/v1/b/myBucket/o?uploadType=multipart
		//builder.addParts(inParams);
		String mediadbid = (String)inParams.get("mediadbid");
		String subfolder = (String)inRoot.get("subfolder");
		inParams.put("folderdetails", inRoot);
		String url = getServer() + "/" + mediadbid + "/services/module/asset/sync/uploadfolder.json";
		try
		{
			debug("pushFolder on" + subfolder + " sent " + inParams.toJSONString());
			
			CloseableHttpResponse resp = getHttpConnection().sharedPostWithJson(url,inParams);
	
			if (resp.getStatusLine().getStatusCode() == 200)
			{
				JSONParser parser = new JSONParser();
				String returned = EntityUtils.toString(resp.getEntity());
				debug(subfolder + " returned: " + returned);
				JSONObject parsed = getHttpConnection().parseJson(resp);
				uploadFilesIntoCollection(subfolder,parsed);
			}
			else
			{
				debug("pushFolder Error on " + subfolder  + " code:" + resp.getStatusLine().getStatusCode() );
				getLogListener().info(resp.getStatusLine().getStatusCode() + " Could not upload " + url + " " + resp.getStatusLine().getReasonPhrase());
			}
		}
		catch( Exception ex)
		{
			throw new RuntimeException(ex);
		}
	}
	private void debug(String inString)
	{
		System.out.println(inString);
	}

	protected void uploadFilesIntoCollection(String subfolder, JSONObject assetsRequested)
	{
		String catalogid = (String)assetsRequested.get("catalogid");
		String mediadbid = (String)assetsRequested.get("mediadbid");
		String collectionid = (String)assetsRequested.get("collectionid");
		Collection files = (Collection)assetsRequested.get("toupload");
		
		if( files == null)
		{
			getLogListener().info("No changes to upload in " + subfolder);
		}
		else
		{
			getLogListener().info("uploading " + files.size() + " files in "+ subfolder);
			for (Iterator iterator = files.iterator(); iterator.hasNext();)
			{
				JSONObject fileinfo = (JSONObject) iterator.next();
				String url = getServer() + "/" + mediadbid + "/services/module/asset/sync/uploadfile.json";
				String abs = (String)fileinfo.get("fullpath");
				File tosend = new File(abs);
				JSONObject tosendparams = new JSONObject(fileinfo);
				tosendparams.put("file.0", tosend);
				tosendparams.put("catalogid",catalogid);
				tosendparams.put("mediadbid",mediadbid);
				tosendparams.put("collectionid",collectionid);
				tosendparams.put("subfolder",subfolder);
//				String assetid = inReq.getRequestParameter("assetid");
//				String catalogid = inReq.getRequestParameter("catalogid");
//				String assetmodificationdate = inReq.getRequestParameter("assetmodificationdate");
				
				//String savepath = (String)fileinfo.get("subfolder");
				//inParams.put("subfolder", savepath);
				HttpResponse resp = getHttpConnection().sharedMimePost(url,tosendparams);
				getFiller().consume(resp);

				if (resp.getStatusLine().getStatusCode() != 200)
				{
					//error
					//reportError();
					throw new RuntimeException(resp.getStatusLine().getStatusCode() + " Could not upload: " + abs + " Error: " + resp.getStatusLine().getReasonPhrase() );
				}
			}	
		}
	}

	public void loginComplete(String inEnterMediaKey)
	{
		getConfig().put("key", inEnterMediaKey);
		getConfig().save();

		getHttpConnection().putSharedHeader("X-tokentype", "entermedia");
		getHttpConnection().putSharedHeader("X-token", inEnterMediaKey);

//		String server = getServer();
//		String host = getHost();
//		getHttpConnection().addSharedCookie(host,"entermedia.key", inEnterMediaKey);
	}

	protected String getHost()
	{
		URI uri = null;
		try
		{
			uri = new URI(getServer());
		}
		catch (URISyntaxException e)
		{
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
		return uri.getHost();
	}

	public String downloadFile(JSONObject inMap)
	{

		String url = (String) inMap.get("url");
		String assetid = (String) inMap.get("assetid");
		String catalogid = (String) inMap.get("catalogid");
		String filename = (String) inMap.get("filename");
		String mediadb = (String) inMap.get("mediadbid");

		String finalurl = getServer() +"/"+ mediadb + "/services/module/asset/downloads/originals/" + url;
		String path = getWorkFolder() + "/assets/" + catalogid + "/" + assetid + "/" + filename ;
		File folder = new File(path);
		folder.getParentFile().mkdirs();
		inMap.put("entermedia.key", getEnterMediaKey());

		String error = null;
		HttpResponse resp = getHttpConnection().sharedPost(finalurl, inMap);
		if (resp.getStatusLine().getStatusCode() == 200)
		{
			InputStream input = null;
			FileOutputStream output = null;
			try
			{
				input = resp.getEntity().getContent();
				folder.getParentFile().mkdirs();
				output = new FileOutputStream(folder);
				
				//TODO: Send progress reports back to the Server for display
				getFiller().fill(input, output);

				String savetime = (String) inMap.get("assetmodificationdate");
				folder.setLastModified(Long.parseLong(savetime));
				
			}
			catch (Throwable ex)
			{
				error = ex.getMessage();
				getLogListener().reportError("Problem downloading", ex);
			}
			finally
			{
				getFiller().consume(resp);
				getFiller().close(input);
				getFiller().close(output);
			}

		}
		else
		{
			getLogListener().info(resp.getStatusLine().getStatusCode() + " Could not download " + url + " " + resp.getStatusLine().getReasonPhrase());
		}

		if( error != null)
		{
			Message mes = new Message();
			mes.putAll(inMap);
			mes.setCommand("downloadasset_error");
			mes.put("errormessage",error);
			getConnection().send(mes);		
		}
		else
		{
			Message mes = new Message();
			mes.putAll(inMap);
			mes.setCommand("downloadasset_completed");
			getConnection().send(mes);		
		}
		return path;
		
	}

	public void uploadAsset(JSONObject inMap)
	{
		// TODO Auto-generated method stub
		
	

	
		try
		{
			//String url = (String) inMap.get("uploadurl");
					
			String mediadbid = (String)inMap.get("mediadb");
			String catalogid = (String) inMap.get("catalogid");
			String assetid = (String) inMap.get("assetid");
			String name = (String) inMap.get("filename");
			String filepath = getWorkFolder() + "/assets/" + catalogid + "/" + assetid + "/" + name ;
			
			boolean replace = (Boolean)inMap.get("replace");
			String url = null;
			if(replace == true) {
				url = getServer() + "/" + mediadbid + "/services/module/asset/attachments/uploadprimary.json?assetid=" + assetid;
			}
			
			else {
				inMap.remove("assetid"); //need a new one.
				
				url = getServer() + "/" + mediadbid + "/services/module/asset/create";

			}
			File file = new File(filepath);
			HttpMimeBuilder builder = new HttpMimeBuilder();

			//TODO: Use HttpRequestBuilder.addPart()
			HttpPost method = new HttpPost(url);
			//POST https://www.googleapis.com/upload/storage/v1/b/myBucket/o?uploadType=multipart
			builder.addPart("metadata", inMap.toJSONString(), "application/json"); //What should this be called?
			builder.addPart("file.0", file);
			builder.addPart("path", url);

			method.setEntity(builder.build());

			HttpResponse resp = getHttpConnection().getSharedClient().execute(method);

			if (resp.getStatusLine().getStatusCode() != 200)
			{
				String returned = EntityUtils.toString(resp.getEntity());
				getFiller().consume(resp);

			}
			
			
		}
		catch (Exception e)
		{
			// TODO Auto-generated catch block
			throw new RuntimeException(e);
		}

	}
	

	protected void listLocalFilesToCache(Map inParams, String absrootfolder)
	{
		JSONObject params = new JSONObject(inParams);
		params.put("entermedia.key", getEnterMediaKey());
		params.put("rootfolder",absrootfolder);

		File parentfolder = new File(absrootfolder);

		ArrayList filelist = new ArrayList();
		ArrayList childfolders = new ArrayList();

		JSONObject root = new JSONObject();
		
		params.put("folderdetails", root);
		
		root.put("rootfolder",absrootfolder);
		root.put("foldername", parentfolder.getName());
		root.put("filelist", filelist);
		root.put("childfolders", childfolders);

		File[] files = parentfolder.listFiles();
		if( files != null)
		{
			for (int i = 0; i < files.length; i++)
			{
				File child = files[i];
				if (child.isDirectory())
				{
	
					JSONObject folderinfo = new JSONObject();
					folderinfo.put("foldername", child.getName());
					folderinfo.put("abspath", child.getAbsolutePath());
					childfolders.add(folderinfo);
				}
				else
				{
					JSONObject fileinfo = new JSONObject();
					fileinfo.put("filename", child.getName());
					fileinfo.put("abspath", child.getAbsolutePath());
					fileinfo.put("filesize", child.length());
					fileinfo.put("modificationdate", child.lastModified());
	//					String newmd5 = runMd5(child);
	//					fileinfo.put("newmd5", newmd5);
					
					filelist.add(fileinfo);
				}
			}
		}
		Message mes = new Message();
		mes.putAll(params);
		mes.setCommand("addlocalfilestocache_response " + absrootfolder);
		
		getConnection().send(mes);
	}

	public void getTopLevelFolders(JSONObject inParams)
	{
		JSONObject params = new JSONObject(inParams);
		params.put("entermedia.key", getEnterMediaKey());

		ArrayList childfolders = new ArrayList();

		params.put("childfolders", childfolders);
		
		File homefolder = new File(findHome());
		JSONObject folderinfo = new JSONObject();
		folderinfo.put("foldername", "Home");
		folderinfo.put("abspath", homefolder.getPath());
		childfolders.add(folderinfo);
	
		addSubFolder(childfolders, homefolder, "Desktop");
		addSubFolder(childfolders, homefolder, "Documents");
		addSubFolder(childfolders, homefolder, "Downloads");
		addSubFolder(childfolders, homefolder, "Pictures");
		addSubFolder(childfolders, homefolder, "Videos");
		
		Message mes = new Message();
		mes.putAll(params);
		mes.setCommand("addlocalfilestocache_response");
		
		getConnection().send(mes);
	}

	protected void addSubFolder(ArrayList childfolders, File homefolder, String inSub)
	{
		File folder = new File(homefolder, inSub);
		if( folder.exists() )
		{
			JSONObject folderinfo = new JSONObject();
			folderinfo.put("foldername", inSub);
			folderinfo.put("abspath", folder.getPath());
			childfolders.add(folderinfo);
		}
	}

	public void renewKeyNow()
	{
		// TODO Auto-generated method stub
		Message mes = new Message("renew_entermediakey");
		mes.put("entermedia.key", getEnterMediaKey());
		getConnection().send(mes);
	}

	/*
	protected void sendFolderCache(JSONObject inParams)
	{
		//TODO: Call some post command and POST a folder full of content

		//POST https://www.googleapis.com/upload/storage/v1/b/myBucket/o?uploadType=multipart
		//builder.addParts(inParams);
		String mediadbid = (String)inParams.get("mediadbid");
		String rootfolder = (String)inParams.get("rootfolder");
		String url = getServer() + "/" + mediadbid + "/services/module/asset/sync/uploadfoldercache.json";
		try
		{
			debug("pushFolderCache on" + rootfolder + " sent " + inParams.toJSONString());
			
			HttpResponse resp = getHttpConnection().sharedJsonPost(url,inParams);
	
			if (resp.getStatusLine().getStatusCode() == 200)
			{
				JSONParser parser = new JSONParser();
				String returned = EntityUtils.toString(resp.getEntity());
				debug(rootfolder + " returned: " + returned);
				JSONObject parsed = (JSONObject)parser.parse(returned);
//				Reader reader = new InputStreamReader(resp.getEntity().getContent(),"UTF-8");
//				JSONObject parsed = (JSONObject)parser.parse(reader);
//				getFiller().close(reader);
				EntityUtils.consume(resp.getEntity());
				//uploadFilesIntoCollection(subfolder,parsed);
				
			}
			else
			{
				debug("pushFolder Error on " + rootfolder  + " code:" + resp.getStatusLine().getStatusCode() );
				getLogListener().info(resp.getStatusLine().getStatusCode() + " Could not upload " + url + " " + resp.getStatusLine().getReasonPhrase());
			}
		}
		catch( Exception ex)
		{
			throw new RuntimeException(ex);
		}
	}
	*/
}
