package org.entermediadb.mediaboat;

import java.net.URI;
import java.util.Collection;

import org.entermediadb.mediaboat.components.LoginForm;
import org.java_websocket.drafts.Draft_6455;
import org.json.simple.JSONObject;

public class AppController implements LogListener
{
	EnterMediaModel model;//
	LoginForm fieldLoginForm;
	
	public LoginForm getLoginForm()
	{
		return fieldLoginForm;
	}

	public void setLoginForm(LoginForm inLoginForm)
	{
		fieldLoginForm = inLoginForm;
	}

	public EnterMediaModel getModel()
	{
		if (model == null)
		{
			model = new EnterMediaModel();
			model.setLogListener(this);
		}
		return model;
	}
	
	public Configuration getConfig()
	{
		return getModel().getConfig();
	}
	public boolean connect(String server, String inUname, String inPass)
	{
		try
		{
			if( getModel().getConnection() != null && getModel().getConnection().isClosing() )
			{
				//return false;
				getModel().getConnection().disconnect();
				getModel().setConnection(null);
			}
			int i;
			if ((i = server.indexOf("/", 8)) > -1)
			{
				//strip off /s
				server = server.substring(0, i);
			}
			String prefix = server.substring(server.lastIndexOf("/") + 1);

			String url = "ws://" + prefix + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection";
			url = url + "?userid=" + getModel().getUserId();
			URI path = new URI(url);
			// more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
			WsConnection connection = new WsConnection(path, new Draft_6455());
			connection.setAppController(this);
			getModel().setConnection(connection);
			return getModel().connect(server,inUname,inPass);
		}
		catch( Exception ex)
		{
			reportError("Could not connect" , ex);
		}
		//Send client info
		return false;
	}
	public void reportError(String inString, Throwable inEx)
	{
		getLoginForm().reportError(inString, inEx);
	}
	public void info(String inString)
	{
		getLoginForm().info(inString);
	}
	public void download(JSONObject inMap)
	{
		Collection datapaths = (Collection)inMap.get("assetpaths");
		String subfolder = (String)inMap.get("path");
		getModel().download(subfolder, datapaths);
		
	}
	//has connection
	//has UI
	//has API
	public void logoff()
	{
		getModel().disconnect();
		System.exit(0);
		
	}
	

	public void checkinFiles(JSONObject inMap)
	{
		// TODO Auto-generated method stub
		getModel().checkinFiles(inMap);
	}

	public void loginComplete(String inValue)
	{
		// TODO Auto-generated method stub
		getModel().loginComplete(inValue);
				
	}

	public boolean reconnect()
	{
		// 
		info("Reconnecting");
		
		String user = getConfig().get("username");
		String server = getConfig().get("server");
		//check  for key
		String key = getConfig().get("entermedia.key");
		if( connect(server, user, key))
		{
			return true;
		}
		return false;
	}
}
