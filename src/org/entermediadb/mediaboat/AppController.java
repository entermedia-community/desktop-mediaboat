package org.entermediadb.mediaboat;

import java.util.Collection;

import org.json.simple.JSONObject;

public class AppController
{
	EnterMediaModel model = new EnterMediaModel();
	
	public Configuration getConfig()
	{
		return model.getConfig();
	}
	public boolean connect(String server, String inUname, String inPass)
	{
		return model.connect(server,inUname,inPass);
		//Send client info
		
	}
	public void download(JSONObject inMap)
	{
		String path =  (String)inMap.get("abspath");
		Collection sourcepaths = (Collection)inMap.get("sourcepaths");
		model.download(path,sourcepaths);
		
	}
	//has connection
	//has UI
	//has API
	
}
